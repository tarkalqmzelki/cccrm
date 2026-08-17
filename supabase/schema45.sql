-- =====================================================================
-- Calista Concept — schema45.sql
-- Run AFTER schema.sql through schema44.sql.
--
-- 1. Add missing activity_type enum values (potential_meeting, email,
--    task, reminder) — fixes "potential_meeting errors on create".
-- 2. Add lead_status enum + column to companies — allows leads to have
--    their own status (Interested, In progress, etc.) settable by owner
--    + admin.
-- 3. Create lead_reminders table + RLS — for the "Remind Me" button on
--    leads.  Each row schedules a push notification at a future time.
-- 4. Cron job (every 5 min) that scans for due reminders and inserts
--    inbox_messages — which fires the existing push trigger/webhook.
-- 5. New notification template: user_lead_reminder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add missing activity_type enum values
--    schema26 created the enum with `exception when duplicate_object`,
--    so if it was created earlier without these values, re-running
--    schema26 was a no-op.  Use ALTER TYPE ADD VALUE which is safe.
-- ---------------------------------------------------------------------
do $$ begin alter type public.activity_type add value if not exists 'potential_meeting'; exception when others then null; end $$;
do $$ begin alter type public.activity_type add value if not exists 'email'; exception when others then null; end $$;
do $$ begin alter type public.activity_type add value if not exists 'task'; exception when others then null; end $$;
do $$ begin alter type public.activity_type add value if not exists 'reminder'; exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 2. lead_status enum + column on companies
-- ---------------------------------------------------------------------
do $$ begin
  create type public.lead_status as enum (
    'new', 'contacted', 'interested', 'in_progress', 'won', 'lost'
  );
exception when duplicate_object then null; end $$;

alter table public.companies
  add column if not exists lead_status public.lead_status not null default 'new';
alter table public.companies
  add column if not exists lead_status_updated_at timestamptz;

create index if not exists companies_lead_status_idx on public.companies(lead_status);

-- Allow any authenticated user to update lead_status (the UI gates by
-- owner/admin).  RLS already permits owners/admins to update companies.
-- We just make sure the column is writable via the existing update policy.

-- ---------------------------------------------------------------------
-- 3. lead_reminders table
-- ---------------------------------------------------------------------
create table if not exists public.lead_reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  remind_at    timestamptz not null,
  title        text not null default '',
  body         text not null default '',
  sent         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists lr_due_idx on public.lead_reminders(remind_at) where sent = false;
create index if not exists lr_user_idx on public.lead_reminders(user_id);

alter table public.lead_reminders enable row level security;
drop policy if exists "lr_owner" on public.lead_reminders;
create policy "lr_owner" on public.lead_reminders
  for all using (user_id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ---------------------------------------------------------------------
-- 4. Cron job — every 5 min, fire due reminders as inbox messages.
--    The inbox_messages insert cascades to push via the existing trigger.
--    SECURITY DEFINER so it can read lead_reminders past RLS.
-- ---------------------------------------------------------------------
create or replace function public.fire_due_lead_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select lr.id, lr.user_id, lr.company_id, lr.title, lr.body,
           c.name as company_name
    from public.lead_reminders lr
    join public.companies c on c.id = lr.company_id
    where lr.sent = false
      and lr.remind_at <= now()
    order by lr.remind_at
    limit 50
  loop
    begin
      insert into public.inbox_messages (
        recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
      ) values (
        r.user_id,
        r.user_id,
        'system',
        coalesce(nullif(trim(r.title), ''), 'Lead reminder'),
        coalesce(nullif(trim(r.body), ''), 'Reminder for lead "' || r.company_name || '"'),
        '/leads/' || r.company_id,
        jsonb_build_object('kind', 'lead_reminder', 'company_id', r.company_id, 'reminder_id', r.id),
        'user_lead_reminder'
      );
      update public.lead_reminders set sent = true where id = r.id;
    exception when others then
      -- Don't let one bad row stop the batch; keep going.
      null;
    end;
  end loop;
end;
$$;

-- Register the cron schedule (every 5 minutes).
do $$
declare
  cron_installed bool;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into cron_installed;
  if not cron_installed then
    raise notice 'pg_cron not installed — skipping lead-reminders cron. Enable pg_cron in the dashboard to activate.';
    return;
  end if;

  perform cron.unschedule('calista-lead-reminders');
  perform cron.schedule(
    'calista-lead-reminders',
    '* * * * *',
    $cron$select public.fire_due_lead_reminders();$cron$
  );
  raise notice 'Lead-reminders cron scheduled (every minute).';
exception when others then
  raise notice 'Could not schedule lead-reminders cron: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 5. New notification template: user_lead_reminder
-- ---------------------------------------------------------------------
insert into public.notification_templates (key, enabled, title_template, body_template, tone) values
  ('user_lead_reminder', true, 'Reminder', 'Reminder — Meeting reminder for {subject}', 'high')
on conflict (key) do nothing;

-- Also add the key to the NotificationKey enum-like list (handled in
-- the types.ts file).  Update notification_key list to include it.

NOTIFY pgrst, 'reload schema';
