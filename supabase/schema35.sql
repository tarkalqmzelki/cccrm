-- =====================================================================
-- Calista Concept — schema35.sql
-- Run AFTER schema.sql through schema34.sql.
--
-- FIX (actual root cause): pg_net's real signature is
--   net.http_post(
--     url                  text,
--     body                 text   DEFAULT '',         -- 2nd arg!
--     params               jsonb  DEFAULT '{}'::jsonb,
--     headers              jsonb  DEFAULT '{}'::jsonb,
--     timeout_milliseconds integer DEFAULT 1000
--   ) RETURNS bigint
--
-- My wrapper called it as (url, headers, body) — wrong order, wrong
-- types at wrong positions. Both named and positional calls failed
-- because no overload matches (text, jsonb, text).
--
-- Correct positional call: net.http_post(url, body, params, headers, timeout)
-- =====================================================================

-- Drop the broken wrapper from schema33/34
drop function if exists public.http_post(text, jsonb, text);

-- ---------------------------------------------------------------------
-- 1. Create the wrapper with the CORRECT pg_net signature.
--    Uses POSITIONAL args in pg_net's actual order:
--    (url, body, params, headers, timeout_milliseconds)
-- ---------------------------------------------------------------------
do $outer$
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
    raise exception 'No http_post function found. Enable pg_net in Supabase dashboard → Database → Extensions.';
  end if;

  -- Wrapper signature keeps the friendly (url, headers, body) order so
  -- the trigger code reads naturally — but we forward to pg_net in its
  -- actual order: (url, body, params, headers, timeout).
  execute format(
    $f$
      create or replace function public.http_post(
        url     text,
        headers jsonb,
        body    text
      ) returns bigint
      language sql
      security definer
      set search_path = public, %1$I
      as $func$
        select %1$I.http_post(
          url,                  -- 1. url
          body,                 -- 2. body (pg_net's 2nd positional!)
          '{}'::jsonb,          -- 3. params (none)
          headers,              -- 4. headers
          5000                  -- 5. timeout (5s)
        )
      $func$;
    $f$,
    ns
  );

  raise notice 'Wrapper created. pg_net found in schema "%".', ns;
end $outer$;

-- ---------------------------------------------------------------------
-- 2. Recreate the push trigger (unchanged — calls public.http_post).
-- ---------------------------------------------------------------------
create or replace function public.trigger_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
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
    perform public.http_post(
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
-- 3. Re-register cron with the public.http_post wrapper.
-- ---------------------------------------------------------------------
do $cronsetup$
declare
  edge_url text;
  bearer   text;
  cron_installed bool;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into cron_installed;
  if not cron_installed then
    raise notice 'pg_cron not installed — skipping cron schedule.';
    return;
  end if;

  select value into edge_url from public.app_secrets where key = 'daily_reminders_url';
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  if edge_url is null or bearer is null then
    raise notice 'daily_reminders_url or edge_bearer missing — skipping cron schedule.';
    return;
  end if;

  perform cron.unschedule('calista-daily-reminders');
  perform cron.schedule(
    'calista-daily-reminders',
    '0 9 * * *',
    format(
      $cronbody$
        select public.http_post(
          %1$L,
          jsonb_build_object(
            'Authorization', 'Bearer ' || %2$L,
            'Content-Type',  'application/json'
          ),
          jsonb_build_object('trigger', 'daily_reminders')::text
        );
      $cronbody$,
      edge_url,
      bearer
    )
  );
  raise notice 'Daily reminders cron scheduled.';
exception when others then
  raise notice 'Could not schedule cron: %', sqlerrm;
end $cronsetup$;

NOTIFY pgrst, 'reload schema';
