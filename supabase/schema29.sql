-- =====================================================================
-- Calista Concept — schema29.sql
-- Run AFTER schema.sql through schema28.sql.
--
-- Web Push notifications infrastructure.
--
-- Components:
--   1. push_subscriptions    — one user → many browser/device endpoints
--   2. notification_preferences — per-user enable/disable toggle for each
--                              notification type (admins and users)
--   3. notification_templates  — admin-controlled title/body templates +
--                              global enable/disable per type
--   4. app_secrets            — small key/value store for the bearer token
--                              used by the pg_net -> Edge Function call
--   5. notification_key column on inbox_messages — the canonical type used
--                              to look up template + preference
--   6. trg_notify_push — AFTER INSERT on inbox_messages → calls the
--                              send-push Edge Function via pg_net
--   7. trg_notify_deal_approved — AFTER UPDATE on deals → drops an inbox
--                              message to the seller when status becomes
--                              'approved' (so the push cascade fires)
--   8. trg_notify_payout_paid — AFTER UPDATE on payouts → drops an inbox
--                              message to the seller when status becomes
--                              'paid'
--   9. pg_cron schedule — daily-reminders Edge Function runs once per day
--                              to remind admins of stale pending payouts
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. push_subscriptions
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth_key    text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "ps_owner" on public.push_subscriptions;
create policy "ps_owner" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role bypasses RLS so the Edge Function can read all subscriptions.

create index if not exists ps_user_idx on public.push_subscriptions(user_id);

-- ---------------------------------------------------------------------
-- 2. notification_preferences  (per-user toggle)
-- ---------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null,
  enabled    boolean not null default true,
  primary key (user_id, key)
);

alter table public.notification_preferences enable row level security;
drop policy if exists "np_owner" on public.notification_preferences;
create policy "np_owner" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. notification_templates  (admin-controlled, global)
-- ---------------------------------------------------------------------
create table if not exists public.notification_templates (
  key              text primary key,
  enabled          boolean not null default true,
  title_template   text not null,
  body_template    text not null,
  tone             text not null default 'normal'  -- low | normal | high | urgent
);

alter table public.notification_templates enable row level security;
drop policy if exists "nt_admin_read" on public.notification_templates;
create policy "nt_admin_read" on public.notification_templates
  for select using (true);
drop policy if exists "nt_admin_write" on public.notification_templates;
create policy "nt_admin_write" on public.notification_templates
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Seed default templates. Placeholders: {subject} {actor} {amount} {period} {when}
insert into public.notification_templates (key, enabled, title_template, body_template, tone) values
  ('admin_deal_new',        true, 'New deal submitted',         '{actor} submitted a new deal: {subject}.', 'normal'),
  ('admin_deal_review',     true, 'Deal needs review',          '{subject} is now pending review.', 'high'),
  ('admin_lead_new',        true, 'New lead added',             '{actor} added a new lead: {subject}.', 'normal'),
  ('admin_inbox',           true, 'New inbox message',          '{subject}', 'normal'),
  ('admin_meeting',         true, 'Calendar activity assigned', '{actor} assigned you: {subject} — {when}.', 'normal'),
  ('admin_payout_reminder', true, 'Pending payout reminder',    '{amount} has been pending since {when}.', 'high'),
  ('user_inbox',            true, 'New message',                '{subject}', 'normal'),
  ('user_deal_approved',    true, 'Deal approved',              'Your deal {subject} was approved.', 'normal'),
  ('user_lead_status',      true, 'Lead status updated',        'Your lead {subject} is now {subject}.', 'normal'),
  ('user_payout',           true, 'Payout received',            'A payout of {amount} has been marked as paid.', 'normal')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. app_secrets  (used by pg_net -> Edge Function auth)
-- ---------------------------------------------------------------------
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);

alter table public.app_secrets enable row level security;
drop policy if exists "as_admin" on public.app_secrets;
create policy "as_admin" on public.app_secrets
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- The trigger runs as SECURITY DEFINER so it can read past RLS.

-- ---------------------------------------------------------------------
-- 5. notification_key column on inbox_messages
-- ---------------------------------------------------------------------
alter table public.inbox_messages
  add column if not exists notification_key text;

-- ---------------------------------------------------------------------
-- 6. Trigger — call send-push Edge Function on every inbox insert.
--    SECURITY DEFINER so it can read app_secrets (RLS-protected).
-- ---------------------------------------------------------------------
create or replace function public.trigger_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bearer text;
  edge_url text;
begin
  select value into bearer  from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';
  if bearer is null or edge_url is null then
    -- Setup not finished yet — silently skip. Admin configures app_secrets.
    return new;
  end if;

  perform net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || bearer,
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      'recipient_id',        new.recipient_id,
      'inbox_id',            new.id,
      'inbox_type',          new.type,
      'notification_key',    coalesce(new.notification_key, ''),
      'title',               new.title,
      'body',                new.body,
      'action_url',          coalesce(new.action_url, ''),
      'metadata',            coalesce(new.metadata, '{}'::jsonb)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_push on public.inbox_messages;
create trigger trg_notify_push
  after insert on public.inbox_messages
  for each row execute function public.trigger_push_notification();

-- ---------------------------------------------------------------------
-- 7. Trigger — when a deal becomes 'approved', drop an inbox message
--    into the seller's mailbox (which then cascades to push).
-- ---------------------------------------------------------------------
create or replace function public.notify_deal_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    insert into public.inbox_messages (
      recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
    ) values (
      new.seller_id,
      auth.uid(),
      'system',
      'Deal approved',
      'Your deal "' || coalesce(new.company, 'Untitled') || '" was approved.',
      '/deals/' || new.id,
      jsonb_build_object('kind', 'deal_approved', 'deal_id', new.id),
      'user_deal_approved'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_deal_approved on public.deals;
create trigger trg_notify_deal_approved
  after update of status on public.deals
  for each row execute function public.notify_deal_approved();

-- ---------------------------------------------------------------------
-- 8. Trigger — when a payout becomes 'paid', drop an inbox message
--    into the seller's mailbox.
-- ---------------------------------------------------------------------
create or replace function public.notify_payout_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' and new.status = 'paid' and old.status <> 'paid' then
    insert into public.inbox_messages (
      recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
    ) values (
      new.seller_id,
      auth.uid(),
      'system',
      'Payout received',
      'A payout of ' || to_char(new.amount, 'FM999G999G990D00') || ' has been marked as paid.',
      '/payouts',
      jsonb_build_object('kind', 'payout_paid', 'payout_id', new.id, 'amount', new.amount),
      'user_payout'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_payout_paid on public.payouts;
create trigger trg_notify_payout_paid
  after update of status on public.payouts
  for each row execute function public.notify_payout_paid();

-- ---------------------------------------------------------------------
-- 9. pg_cron — call daily-reminders Edge Function at 09:00 UTC.
--    Requires the pg_cron extension (Supabase dashboard → Database →
--    Extensions → enable pg_cron). The cron job runs as the postgres
--    role so it can read app_secrets.
-- ---------------------------------------------------------------------
-- Make sure pg_net is available (it is on every Supabase project).
create extension if not exists pg_net;

do $$
declare
  edge_url text;
  bearer text;
  cron_installed bool;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into cron_installed;
  if not cron_installed then
    -- pg_cron must be enabled from the Supabase dashboard first.
    -- Once enabled, re-run this file (or just the block below) to
    -- register the schedule.
    return;
  end if;

  select value into edge_url from public.app_secrets where key = 'daily_reminders_url';
  select value into bearer  from public.app_secrets where key = 'edge_bearer';
  if edge_url is null or bearer is null then return; end if;

  -- Replace any existing schedule for this job.
  perform cron.unschedule('calista-daily-reminders');
  perform cron.schedule(
    'calista-daily-reminders',
    '0 9 * * *',
    format(
      $cron$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || %L,
            'Content-Type',  'application/json'
          ),
          body := jsonb_build_object('trigger', 'daily_reminders')
        );
      $cron$,
      edge_url,
      bearer
    )
  );
exception when others then null;
end $$;

NOTIFY pgrst, 'reload schema';
