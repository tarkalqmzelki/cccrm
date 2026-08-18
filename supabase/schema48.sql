-- =====================================================================
-- Calista Concept — schema48.sql
-- Run AFTER schema.sql through schema47.sql.
--
-- Push notifications were going out for broadcasts (because the admin
-- fan-out writes inbox_messages directly) but NOT for new leads, new
-- deals, or deals that move INTO pending_review.  Reason: schema29 only
-- created triggers for `deal approved` and `payout paid`.  The new-lead
-- and new-deal templates existed in notification_templates but nothing
-- inserted the inbox_messages rows that the push cascade consumes.
--
-- This file adds the three missing fan-out triggers.  Each writes one
-- inbox_messages row per active admin with the right notification_key;
-- the existing trg_notify_push trigger (schema41) then POSTs each row
-- to the send-push Edge Function, which honours the per-user
-- preference + global template toggle before delivering the push.
--
-- Also re-schedules the lead-reminders cron in case pg_cron was
-- disabled when schema45 first ran (the schedule call was a no-op then).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New lead — fan-out to all active admins on companies INSERT
-- ---------------------------------------------------------------------
create or replace function public.notify_admin_lead_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin record;
  actor_id uuid;
  actor_name text;
begin
  actor_id := coalesce(auth.uid(), new.created_by);
  select full_name into actor_name from public.profiles where id = actor_id;

  for admin in
    select id from public.profiles
      where role = 'admin' and active = true
      and id is distinct from actor_id  -- don't notify the actor themselves
  loop
    insert into public.inbox_messages (
      recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
    ) values (
      admin.id,
      actor_id,
      'system',
      'New lead added',
      coalesce(actor_name, 'Someone') || ' added a new lead: ' || coalesce(new.name, 'Untitled'),
      '/leads/' || new.id,
      jsonb_build_object(
        'kind', 'lead_new',
        'company_id', new.id,
        'actor_id', actor_id,
        'actor_name', coalesce(actor_name, 'Someone')
      ),
      'admin_lead_new'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_admin_lead_new on public.companies;
create trigger trg_notify_admin_lead_new
  after insert on public.companies
  for each row execute function public.notify_admin_lead_new();

-- ---------------------------------------------------------------------
-- 2. New deal — fan-out to all active admins on deals INSERT
-- ---------------------------------------------------------------------
create or replace function public.notify_admin_deal_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin record;
  actor_id uuid;
  actor_name text;
begin
  actor_id := coalesce(auth.uid(), new.seller_id);
  select full_name into actor_name from public.profiles where id = actor_id;

  for admin in
    select id from public.profiles
      where role = 'admin' and active = true
      and id is distinct from actor_id
  loop
    insert into public.inbox_messages (
      recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
    ) values (
      admin.id,
      actor_id,
      'system',
      'New deal submitted',
      coalesce(actor_name, 'Someone') || ' submitted a new deal: ' || coalesce(new.company, 'Untitled'),
      '/deals/' || new.id,
      jsonb_build_object(
        'kind', 'deal_new',
        'deal_id', new.id,
        'actor_id', actor_id,
        'actor_name', coalesce(actor_name, 'Someone')
      ),
      'admin_deal_new'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_admin_deal_new on public.deals;
create trigger trg_notify_admin_deal_new
  after insert on public.deals
  for each row execute function public.notify_admin_deal_new();

-- ---------------------------------------------------------------------
-- 3. Deal needs review — fan-out when status transitions INTO
--    pending_review (UPDATE only — INSERT is handled above).
-- ---------------------------------------------------------------------
create or replace function public.notify_admin_deal_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin record;
  actor_id uuid;
  actor_name text;
begin
  if TG_OP != 'UPDATE' then
    return new;
  end if;
  -- Only fire when status moves INTO pending_review (was something else).
  if new.status = 'pending_review' and coalesce(old.status, '') <> 'pending_review' then
    actor_id := coalesce(auth.uid(), new.seller_id);
    select full_name into actor_name from public.profiles where id = actor_id;

    for admin in
      select id from public.profiles
        where role = 'admin' and active = true
        and id is distinct from actor_id
    loop
      insert into public.inbox_messages (
        recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
      ) values (
        admin.id,
        actor_id,
        'system',
        'Deal needs review',
        coalesce(new.company, 'Untitled') || ' is now pending review.',
        '/deals/' || new.id,
        jsonb_build_object(
          'kind', 'deal_review',
          'deal_id', new.id,
          'actor_id', actor_id,
          'actor_name', coalesce(actor_name, 'Someone')
        ),
        'admin_deal_review'
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_admin_deal_review on public.deals;
create trigger trg_notify_admin_deal_review
  after update of status on public.deals
  for each row execute function public.notify_admin_deal_review();

-- ---------------------------------------------------------------------
-- 4. Re-schedule lead-reminders cron (schema45) — if pg_cron was
--    disabled when schema45 ran, the schedule call was a no-op.
--    This re-tries unconditionally so it picks up the moment pg_cron
--    becomes available.
-- ---------------------------------------------------------------------
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
  raise notice 'Lead-reminders cron re-scheduled (every minute).';
exception when others then
  raise notice 'Could not schedule lead-reminders cron: %', sqlerrm;
end $$;

NOTIFY pgrst, 'reload schema';
