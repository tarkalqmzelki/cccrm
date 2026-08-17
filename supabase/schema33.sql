-- =====================================================================
-- Calista Concept — schema33.sql
-- Run AFTER schema.sql through schema32.sql.
--
-- FIX (final): "function net.http_post(...) does not exist"
--
-- Why schema32 didn't work: Supabase installs pg_net into DIFFERENT
-- schemas depending on project age:
--   - Older projects: `net` schema       -> net.http_post
--   - Newer projects: `extensions` schema -> extensions.http_post
-- schema32 hardcoded `net` — wrong for your project.
--
-- This patch is schema-agnostic:
--   1. Find where http_post actually lives (search pg_proc).
--   2. Create a public.http_post(...) WRAPPER that forwards to the
--      real function. The trigger only ever calls public.http_post,
--      so it works no matter where Supabase put pg_net.
--   3. Recreate the trigger to call public.http_post(...).
--   4. Re-register cron with the same wrapper.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Locate http_post and build a public wrapper.
--    The wrapper is SECURITY DEFINER so it can reach pg_net regardless
--    of the caller's search_path.
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
    raise exception 'pg_net not installed. Enable it in Supabase dashboard → Database → Extensions.';
  end if;

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
      as $func$ select %1$I.http_post(url := url, headers := headers, body := body) $func$;
    $f$,
    ns
  );

  raise notice 'pg_net http_post found in schema "%" — public.http_post wrapper created.', ns;
end $outer$;

-- ---------------------------------------------------------------------
-- 2. Recreate the push trigger to call public.http_post (the wrapper).
--    Exception-safe: push failures never block the message insert.
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
-- 3. Re-register cron using the public.http_post wrapper
-- ---------------------------------------------------------------------
do $cronsetup$
declare
  edge_url text;
  bearer   text;
  cron_installed bool;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into cron_installed;
  if not cron_installed then
    raise notice 'pg_cron not installed — skipping cron schedule. Enable it in the dashboard if you want daily payout reminders.';
    return;
  end if;

  select value into edge_url from public.app_secrets where key = 'daily_reminders_url';
  select value into bearer   from public.app_secrets where key = 'edge_bearer';
  if edge_url is null or bearer is null then
    raise notice 'daily_reminders_url or edge_bearer missing in app_secrets — skipping cron schedule.';
    return;
  end if;

  perform cron.unschedule('calista-daily-reminders');
  perform cron.schedule(
    'calista-daily-reminders',
    '0 9 * * *',
    format(
      $cronbody$
        select public.http_post(
          url := %1$L,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || %2$L,
            'Content-Type',  'application/json'
          ),
          body := jsonb_build_object('trigger', 'daily_reminders')::text
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
