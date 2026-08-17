-- =====================================================================
-- Calista Concept — schema41.sql  (self-contained trigger fix)
-- Run AFTER schema.sql through schema40.sql.
--
-- FIX: schema40's trigger calls public.http_post(text, jsonb, text),
-- but that wrapper was created in schema35 which may not have been run
-- (or got dropped).  This file is self-contained — it creates the
-- wrapper itself AND the trigger, so it doesn't depend on schema35.
--
-- After this runs, the trigger will successfully POST to the Edge
-- Function on every inbox_messages INSERT.
--
-- Prereqs:
--   1. pg_net extension enabled (Dashboard → Database → Extensions)
--   2. Edge Function deployed via `supabase functions deploy send-push`
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create the public.http_post wrapper if it doesn't exist.
--    pg_net installs into `net` schema on Supabase. We auto-detect
--    where http_post lives and build a wrapper with the CORRECT
--    argument order: (url, body, params, headers, timeout).
--    NOTE: pg_net on this project wants `body` as JSONB (not text).
-- ---------------------------------------------------------------------
drop function if exists public.http_post(text, jsonb, text);
drop function if exists public.http_post(text, jsonb, jsonb);

do $wrapper$
declare
  ns text;
begin
  select n.nspname into ns
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'http_post'
    order by case n.nspname
               when 'extensions' then 1
               when 'net'        then 2
               when 'pg_net'     then 3
               else 10
             end
    limit 1;

  if ns is null then
    raise exception 'pg_net not installed. Enable it in Supabase dashboard → Database → Extensions → pg_net.';
  end if;

  -- Wrapper signature: (url text, headers jsonb, body jsonb)
  -- Forwards to pg_net's actual order: (url, body, params, headers, timeout)
  execute format(
    $f$
      create or replace function public.http_post(
        url     text,
        headers jsonb,
        body    jsonb
      ) returns bigint
      language sql
      security definer
      set search_path = public, %1$I
      as $func$
        select %1$I.http_post(url, body, '{}'::jsonb, headers, 5000)
      $func$;
    $f$,
    ns
  );

  raise notice 'public.http_post wrapper created (pg_net in schema "%").', ns;
end $wrapper$;

-- ---------------------------------------------------------------------
-- 2. Recreate the push trigger (same as schema40's, but self-contained
--    and uses jsonb body to match the wrapper signature).
-- ---------------------------------------------------------------------
do $trigger$
declare
  bearer   text;
  edge_url text;
begin
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';

  if bearer is null or edge_url is null then
    raise exception 'app_secrets missing edge_bearer or edge_url. Run the inserts at the bottom of this file with your real service_role key, then re-run.';
  end if;

  create or replace function public.trigger_webhook_push()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    b   jsonb;
    url text;
    tok text;
  begin
    select value into tok from public.app_secrets where key = 'edge_bearer';
    select value into url  from public.app_secrets where key = 'edge_url';
    if tok is null or url is null then
      return new;
    end if;

    b := jsonb_build_object(
      'type',        TG_OP,
      'table',       TG_TABLE_NAME,
      'schema',      TG_TABLE_SCHEMA,
      'record',      to_jsonb(new),
      'old_record',  case when TG_OP = 'UPDATE' then to_jsonb(old) else null end
    );

    begin
      perform public.http_post(
        url,
        jsonb_build_object(
          'Authorization', 'Bearer ' || tok,
          'Content-Type',  'application/json'
        ),
        b
      );
    exception when others then
      insert into public.push_log (recipient_id, key, status, detail)
      values (
        new.recipient_id,
        coalesce(new.notification_key, ''),
        'error',
        'Webhook trigger could not reach the Edge Function: ' || sqlerrm
      );
    end;

    return new;
  end;
  $$;

  drop trigger if exists trg_notify_push on public.inbox_messages;
  create trigger trg_notify_push
    after insert on public.inbox_messages
    for each row execute function public.trigger_webhook_push();

  raise notice 'Push trigger created and armed.';
end $trigger$;

-- ---------------------------------------------------------------------
-- 3. (Optional) If app_secrets was empty, uncomment and run these
--    with your real service_role key:
-- ---------------------------------------------------------------------
-- insert into public.app_secrets (key, value) values
--   ('edge_bearer', 'YOUR_SERVICE_ROLE_KEY'),
--   ('edge_url',    'https://usznpqyqmqgutnlhbqds.functions.supabase.co/send-push')
-- on conflict (key) do update set value = excluded.value;

NOTIFY pgrst, 'reload schema';
