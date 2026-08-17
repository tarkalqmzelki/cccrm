-- =====================================================================
-- Calista Concept — schema31.sql
-- Run AFTER schema.sql through schema30.sql.
--
-- FIX: "function net.http_post(url => text, headers => jsonb, body => text)
--       does not exist"
--
-- Cause: on Supabase the pg_net extension lives in the `extensions`
-- schema, not `public`.  The trigger sets search_path = public, so the
-- unqualified `net.http_post(...)` call cannot resolve — and because
-- the error fired from an AFTER INSERT trigger on inbox_messages, it
-- broke ALL message sending (not just push).
--
-- It only appeared after app_secrets was populated: the trigger skips
-- the HTTP call while edge_url/edge_bearer are NULL, so messaging
-- worked until setup was completed.
--
-- 1. Ensure pg_net is installed (in the extensions schema).
-- 2. Recreate trigger_push_notification:
--      - fully-qualified extensions.net.http_post call
--      - search_path includes extensions as fallback
--      - EXCEPTION handler: any failure is logged to push_log and the
--        insert proceeds — push problems can never block messaging.
-- 3. Re-register the daily-reminders cron schedule with the fully
--    qualified function reference (the schema29 version had the same
--    unqualified bug).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. pg_net — installed by default on Supabase in the `extensions`
--    schema.  Tolerant in case it's already present elsewhere.
-- ---------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Recreate the push trigger — exception-safe + qualified call
-- ---------------------------------------------------------------------
create or replace function public.trigger_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  bearer   text;
  edge_url text;
begin
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';
  if bearer is null or edge_url is null then
    -- Setup not finished yet — skip quietly.
    return new;
  end if;

  begin
    perform extensions.net.http_post(
      url := edge_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || bearer,
        'Content-Type',  'application/json'
      ),
      body := jsonb_build_object(
        'recipient_id',     new.recipient_id,
        'inbox_id',         new.id,
        'inbox_type',       new.type,
        'notification_key', coalesce(new.notification_key, ''),
        'title',            new.title,
        'body',             new.body,
        'action_url',       coalesce(new.action_url, ''),
        'metadata',         coalesce(new.metadata, '{}'::jsonb)
      )::text
    );
  exception when others then
    -- Push delivery must never break the insert that triggered it.
    -- Record the failure so it's visible in Settings → Notifications.
    begin
      insert into public.push_log (recipient_id, key, status, detail)
      values (
        new.recipient_id,
        coalesce(new.notification_key, ''),
        'error',
        'Trigger could not reach the Edge Function: ' || sqlerrm
      );
    exception when others then null;
    end;
  end;

  return new;
end;
$$;

-- Trigger itself is unchanged (same function target) — recreate anyway
-- so a stale definition can't linger.
drop trigger if exists trg_notify_push on public.inbox_messages;
create trigger trg_notify_push
  after insert on public.inbox_messages
  for each row execute function public.trigger_push_notification();

-- ---------------------------------------------------------------------
-- 3. Re-register the cron schedule with the qualified call
-- ---------------------------------------------------------------------
do $$
declare
  edge_url text;
  bearer   text;
  cron_installed bool;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into cron_installed;
  if not cron_installed then
    return;
  end if;

  select value into edge_url from public.app_secrets where key = 'daily_reminders_url';
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  if edge_url is null or bearer is null then return; end if;

  perform cron.unschedule('calista-daily-reminders');
  perform cron.schedule(
    'calista-daily-reminders',
    '0 9 * * *',
    format(
      $cron$
        select extensions.net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || %L,
            'Content-Type',  'application/json'
          ),
          body := jsonb_build_object('trigger', 'daily_reminders')::text
        );
      $cron$,
      edge_url,
      bearer
    )
  );
exception when others then null;
end $$;

NOTIFY pgrst, 'reload schema';
