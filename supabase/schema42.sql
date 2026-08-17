-- =====================================================================
-- Calista Concept — schema42.sql  (DIAGNOSTIC + manual test)
-- Run AFTER schema.sql through schema41.sql.
--
-- PURPOSE: figure out why push_log has zero rows AND the Edge Function
-- has zero invocations despite 5 subscribed devices.  Either the
-- trigger isn't attached, isn't firing, or the http_post call isn't
-- even being attempted.  This file:
--
--   1. Verifies the trigger exists and is attached to inbox_messages.
--   2. Verifies the wrapper function exists and is callable.
--   3. Inserts a real test inbox row, which SHOULD fire the trigger
--      and post to the Edge Function.  The Edge Function logs should
--      show an invocation, OR push_log should show an error row.
--   4. Prints what it found via RAISE NOTICE so you can paste it back.
--
-- Replace YOUR_USER_ID below with the UUID of the admin account
-- you're signed in as (you can get it from the profiles table).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Diagnostic: what triggers + functions exist?
-- ---------------------------------------------------------------------
do $diag$
declare
  trg_count int;
  fn_count  int;
  wrapper_count int;
  secrets_count int;
begin
  select count(*) into trg_count
    from pg_trigger
    where tgname = 'trg_notify_push'
      and tgrelid = 'public.inbox_messages'::regclass;

  select count(*) into fn_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'trigger_webhook_push' and n.nspname = 'public';

  select count(*) into wrapper_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'http_post' and n.nspname = 'public';

  select count(*) into secrets_count
    from public.app_secrets
    where key in ('edge_bearer', 'edge_url') and value is not null;

  raise notice 'Trigger attached: %  (expect 1)', trg_count;
  raise notice 'trigger_webhook_push function: %  (expect 1)', fn_count;
  raise notice 'public.http_post wrapper: %  (expect 1)', wrapper_count;
  raise notice 'app_secrets edge_bearer + edge_url: %  (expect 2)', secrets_count;

  if trg_count = 0 then
    raise notice '!! Trigger NOT attached. Re-run schema41.sql.';
  end if;
  if wrapper_count = 0 then
    raise notice '!! public.http_post wrapper missing. Re-run schema41.sql.';
  end if;
  if secrets_count < 2 then
    raise notice '!! app_secrets missing values. Run the inserts at the bottom of schema40 with your service_role key.';
  end if;
end $diag$;

-- ---------------------------------------------------------------------
-- 2. Direct test — call the Edge Function manually with pg_net.
--    This bypasses the trigger entirely.  If the Edge Function log
--    shows an invocation after this, we know pg_net can reach the
--    function — the problem is the trigger, not the function.
-- ---------------------------------------------------------------------
do $direct$
declare
  bearer   text;
  edge_url text;
  payload  jsonb;
  result   bigint;
begin
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';

  if bearer is null or edge_url is null then
    raise exception 'app_secrets missing edge_bearer or edge_url';
  end if;

  payload := jsonb_build_object(
    'recipient_id', 'a372867a-668a-4000-80cc-327811a5e99d',  -- your latest iOS sub
    'title',       'Direct pg_net test',
    'body',        'If you see this, pg_net can reach the Edge Function.',
    'action_url',  '/inbox',
    'metadata',    '{}'::jsonb,
    'notification_key', 'admin_inbox'
  );

  -- Call the wrapper directly.  If this errors, the wrapper is broken.
  begin
    result := public.http_post(
      edge_url,
      jsonb_build_object(
        'Authorization', 'Bearer ' || bearer,
        'Content-Type',  'application/json'
      ),
      payload
    );
    raise notice 'Direct call returned: %  (request id).  Check Edge Function logs for an invocation.', result;
  exception when others then
    raise notice '!! Direct call FAILED: %  -- %', sqlstate, sqlerrm;
  end;
end $direct$;

NOTIFY pgrst, 'reload schema';
