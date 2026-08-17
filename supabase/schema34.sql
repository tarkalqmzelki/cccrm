-- =====================================================================
-- Calista Concept — schema34.sql
-- Run AFTER schema.sql through schema33.sql.
--
-- FIX: schema33's wrapper used NAMED args (url :=, headers :=, body :=)
-- but your pg_net version uses different parameter names — so the named
-- call didn't match any function. Positional args (url, headers, body)
-- match by POSITION, ignoring parameter names. This works across all
-- pg_net versions.
--
-- Also: logs every http_post function found on your project so we can
-- see the exact signature if positional still fails.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. DIAGNOSTIC — show every http_post function on the project.
--    Output appears in the SQL editor's "NOTICES" / messages panel.
-- ---------------------------------------------------------------------
do $diag$
declare
  row record;
begin
  for row in
    select n.nspname as schema, p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'http_post'
    order by n.nspname
  loop
    raise notice 'Found: %.% (%)', row.schema, row.name, row.args;
  end loop;
end $diag$;

-- ---------------------------------------------------------------------
-- 1. Drop any broken wrapper from schema33.
-- ---------------------------------------------------------------------
drop function if exists public.http_post(text, jsonb, text);

-- ---------------------------------------------------------------------
-- 2. Find where http_post lives, then build a wrapper using POSITIONAL
--    arguments. Positional calls match by arg position, not by name,
--    so they survive pg_net renaming parameters between versions.
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
    raise exception 'No http_post function found anywhere. Enable pg_net in Supabase dashboard → Database → Extensions.';
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
      as $func$ select %1$I.http_post(url, headers, body) $func$;
    $f$,
    ns
  );

  raise notice 'Wrapper created. pg_net http_post found in schema "%" — calling positionally.', ns;
end $outer$;

-- ---------------------------------------------------------------------
-- 3. Recreate the push trigger (unchanged from schema33 — still
--    exception-safe, still calls public.http_post).
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
-- 4. Re-register cron with the public.http_post wrapper.
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
