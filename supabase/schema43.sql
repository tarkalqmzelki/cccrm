-- Direct test: call the Edge Function URL with a simple POST.
-- This is the most minimal test — bypasses the trigger, bypasses
-- everything.  If the Edge Function logs don't show an invocation
-- after this, then pg_net itself can't reach external URLs from your
-- database (a network/firewall issue on Supabase's side).

do $test$
declare
  bearer   text;
  edge_url text;
  payload  jsonb;
begin
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';

  if bearer is null or edge_url is null then
    raise exception 'app_secrets missing edge_bearer or edge_url';
  end if;

  payload := jsonb_build_object(
    'recipient_id', 'a372867a-668a-4000-80cc-327811a5e99d',
    'title',       'Direct pg_net test',
    'body',        'If you see this in Edge Function logs, pg_net can reach the function.',
    'action_url',  '/inbox',
    'metadata',    '{}'::jsonb,
    'notification_key', 'admin_inbox'
  );

  perform public.http_post(
    edge_url,
    jsonb_build_object(
      'Authorization', 'Bearer ' || bearer,
      'Content-Type',  'application/json'
    ),
    payload
  );

  raise notice 'Direct pg_net call sent. Check Edge Function logs for an invocation.';
exception when others then
  raise notice 'pg_net call failed: %', sqlerrm;
end $test$;
