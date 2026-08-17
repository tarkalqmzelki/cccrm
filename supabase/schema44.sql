-- Direct test using the ACTUAL user_id that has subscriptions.
-- Run this in the SQL editor.  Then check Edge Function logs — we
-- should finally see "found 10 subscription(s)" and push attempts.

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
    'recipient_id',     'a0000000-0000-0000-0000-000000000001',  -- Calista Admin (has 10 subs)
    'title',            'Direct test to admin',
    'body',             'If you see this on your phone, push works.',
    'action_url',       '/inbox',
    'metadata',         '{}'::jsonb,
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

  raise notice 'Sent direct test to admin (a0000000-...).  Check Edge Function logs and your phone.';
end $test$;
