-- =====================================================================
-- Calista Concept — schema40.sql  (webhook replacement)
-- Run AFTER schema.sql through schema39.sql.
--
-- If the Supabase Webhooks dashboard UI fails with
-- "schema supabase_functions does not exist" — run this file instead
-- to install the helper schema, then create the webhook via the UI.
--
-- If creating the webhook via the UI still fails after this, the
-- alternative at the bottom of this file creates the webhook trigger
-- manually using the same `net.http_post` mechanism (now that we've
-- confirmed pg_net works on your project with the wrapper from
-- schema35-37).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create the missing schema the Webhooks UI expects.
--    The dashboard's webhook installer tries to install functions into
--    `supabase_functions` schema; if it doesn't exist, the install
--    fails with "schema supabase_functions does not exist".
-- ---------------------------------------------------------------------
create schema if not exists supabase_functions;

-- Some versions also need the supabase_functions management table.
-- Idempotent — safe to run repeatedly.
create table if not exists supabase_functions.migrations (
  id int primary key,
  name text not null,
  hash text not null default ''
);

-- Enable RLS so anon/authenticated clients can't read migration
-- metadata directly (the dashboard's webhook installer still works
-- because it uses the service role, which bypasses RLS).
alter table supabase_functions.migrations enable row level security;
drop policy if exists "migrations_admin_only" on supabase_functions.migrations;
create policy "migrations_admin_only" on supabase_functions.migrations
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Make sure pg_net is available (we already enabled it for the
-- daily-reminders cron earlier, but double-check).
do $$ begin
  create extension if not exists pg_net;
exception when others then null; end $$;

-- Notify PostgREST to reload so it sees the new schema.
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- ALTERNATIVE — if the Webhooks UI STILL fails after running the above,
-- run the block below instead.  It creates the webhook trigger manually
-- using the public.http_post wrapper we built in schema35.
--
-- IMPORTANT before running the alternative block:
--   1. Replace YOUR_SERVICE_ROLE_KEY with your actual service_role key
--      (Dashboard → Settings → API → service_role).
--   2. The schema39.sql trigger drop removed trg_notify_push; this
--      block recreates it as a webhook-style trigger that posts the
--      full inbox row to the Edge Function.
-- =====================================================================

/*
do $webhook$
declare
  bearer text := 'YOUR_SERVICE_ROLE_KEY';  -- replace
  edge_url text := 'https://usznpqyqmqgutnlhbqds.functions.supabase.co/send-push';
begin
  -- Persist into app_secrets so the trigger can read them later
  insert into public.app_secrets (key, value) values
    ('edge_bearer', bearer),
    ('edge_url',    edge_url)
  on conflict (key) do update set value = excluded.value;

  -- Create a webhook-style trigger that posts the full row as the
  -- {type, table, record, schema} shape expected by the Edge Function.
  create or replace function public.trigger_webhook_push()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    b   text;
    url text;
    tok text;
  begin
    select value into tok from public.app_secrets where key = 'edge_bearer';
    select value into url  from public.app_secrets where key = 'edge_url';
    if tok is null or url is null then
      return new;
    end if;

    b := jsonb_build_object(
      'type',     TG_OP,
      'table',    TG_TABLE_NAME,
      'schema',   TG_TABLE_SCHEMA,
      'record',   to_jsonb(new),
      'old_record', case when TG_OP = 'UPDATE' then to_jsonb(old) else null end
    )::text;

    begin
      perform public.http_post(url, jsonb_build_object(
        'Authorization', 'Bearer ' || tok,
        'Content-Type',  'application/json'
      ), b);
    exception when others then
      insert into public.push_log (recipient_id, key, status, detail)
      values (new.recipient_id, coalesce(new.notification_key, ''), 'error',
              'Webhook trigger could not reach the Edge Function: ' || sqlerrm);
    end;

    return new;
  end;
  $$;

  drop trigger if exists trg_notify_push on public.inbox_messages;
  create trigger trg_notify_push
    after insert on public.inbox_messages
    for each row execute function public.trigger_webhook_push();
end $webhook$;
*/
