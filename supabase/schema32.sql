-- =====================================================================
-- Calista Concept — schema32.sql
-- Run AFTER schema.sql through schema31.sql.
--
-- FIX: "cross-database references are not implemented: extensions.net.http_post"
--
-- Root cause: PostgreSQL parses a THREE-part name as
--   database.schema.function  (schemas do NOT nest).
-- So `extensions.net.http_post` was read as
--   database=extensions  schema=net  function=http_post  -> error.
--
-- On Supabase, pg_net installs into a schema called `net`, and the
-- function is just `http_post`.  The correct call is the TWO-part
--   net.http_post(...)
--
-- schema31 tried `create extension pg_net with schema extensions`,
-- but pg_net was already installed in `net` (Supabase default), so
-- that statement failed silently inside an exception block and the
-- function stayed in `net` — while the trigger kept calling the
-- wrong three-part name.
--
-- This patch:
--   1. Verifies pg_net exists and locates http_post in the `net` schema.
--   2. Recreates the trigger with `net.http_post(...)` (two-part).
--   3. Keeps the exception handler so push problems never block messaging.
--   4. Re-registers the daily cron with the same two-part call.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Make sure pg_net is installed. On Supabase it lives in `net`.
--    Don't try to relocate it — that's what caused the previous bug.
-- ---------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_net;
exception when others then null; end $$;

-- Sanity check — if this raises, pg_net isn't installed and the user
-- needs to enable it from the Supabase dashboard (Database → Extensions).
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'http_post' and n.nspname = 'net'
  ) then
    raise notice 'pg_net not found in `net` schema. Enable it in Supabase dashboard → Database → Extensions.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Recreate the push trigger — two-part net.http_post call,
--    exception-safe so messaging never breaks.
-- ---------------------------------------------------------------------
create or replace function public.trigger_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  bearer   text;
  edge_url text;
begin
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';
  if bearer is null or edge_url is null then
    return new;
  end if;

  begin
    perform net.http_post(
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

drop trigger if exists trg_notify_push on public.inbox_messages;
create trigger trg_notify_push
  after insert on public.inbox_messages
  for each row execute function public.trigger_push_notification();

-- ---------------------------------------------------------------------
-- 3. Re-register the cron schedule with the two-part call
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
        select net.http_post(
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
