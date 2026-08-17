-- =====================================================================
-- Calista Concept — schema36.sql  (DIAGNOSTIC + ADAPTIVE)
-- Run AFTER schema.sql through schema35.sql.
--
-- Instead of guessing pg_net's signature, this script:
--   1. Drops the broken wrapper.
--   2. Introspects pg_proc for the REAL http_post signature.
--   3. Builds a REGEX-based dynamic call that pulls the actual arg
--      types from pg_proc and forwards by position.
--   4. Raises a NOTICE with the discovered signature so it's visible
--      in the SQL editor output.
--
-- Supports the two known pg_net signatures:
--   (url text, body text, params jsonb, headers jsonb, timeout_milliseconds int)  -- old
--   (url text, headers jsonb, body text, timeout_milliseconds int)               -- new (Supabase default)
-- And any single-string-body variant.
-- =====================================================================

drop function if exists public.http_post(text, jsonb, text);

do $outer$
declare
  ns        text;
  args_csv  text;
  arg_kinds text[];
  n_args    int;
  body_pos      int := 0;
  headers_pos   int := 0;
  url_pos       int := 0;
  call_args     text;
begin
  -- Locate http_post, prefer extensions/net/pg_net schemas
  select n.nspname, pg_get_function_identity_arguments(p.oid)
    into ns, args_csv
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

  raise notice 'Found http_post in schema "%" with args: %', ns, args_csv;

  -- Parse the arg-type list. pg_get_function_identity_arguments
  -- returns comma-separated types, e.g. "text, jsonb, text, integer".
  arg_kinds := regexp_split_to_array(args_csv, '\s*,\s*');
  n_args    := array_length(arg_kinds, 1);

  -- Identify positions by type. We assume the first 'text' is url,
  -- the 'jsonb' args are body/params/headers in their order, and any
  -- 'integer' is the timeout.
  for i in 1..n_args loop
    if arg_kinds[i] = 'text' and url_pos = 0 then
      url_pos := i;
    elsif arg_kinds[i] = 'jsonb' and headers_pos = 0 then
      -- The LAST jsonb before any integer is headers; we'll refine.
      headers_pos := i;
    end if;
  end loop;

  -- Heuristic that works for both known signatures:
  --   OLD: (url, body, params, headers, timeout)  -- 5 args
  --   NEW: (url, headers, body, timeout)          -- 4 args
  -- Strategy: build call_args array of literals matching positions.
  -- We forward: url at url_pos, our body at the position of the
  -- 'text' arg that ISN'T url, our headers at the LAST jsonb.
  begin
    if n_args = 4 then
      -- (url text, headers jsonb, body text, timeout int)
      call_args := '$1, $2, $3, 5000';
    elsif n_args = 5 then
      -- (url text, body text, params jsonb, headers jsonb, timeout int)
      call_args := '$1, $3, ''{}''::jsonb, $2, 5000';
    elsif n_args = 3 then
      -- (url text, body text, timeout int)
      call_args := '$1, $3, 5000';
    elsif n_args = 2 then
      -- (url text, body text)
      call_args := '$1, $3';
    else
      raise exception 'Unrecognized pg_net signature: http_post(%) — please paste this NOTICE to support.', args_csv;
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
        as $func$ select %1$I.http_post(%2$s) $func$;
      $f$,
      ns,
      call_args
    );
  exception when others then
    raise exception 'Could not build wrapper for signature http_post(%): %', args_csv, sqlerrm;
  end;

  raise notice 'public.http_post wrapper created. Args forwarded as: %', call_args;
end $outer$;

-- ---------------------------------------------------------------------
-- Recreate the trigger (unchanged — calls public.http_post).
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

NOTIFY pgrst, 'reload schema';
