-- =====================================================================
-- Calista Concept — schema30.sql
-- Run AFTER schema.sql through schema29.sql.
--
-- 1. Fix the Sent folder: the inbox_read RLS policy only allowed the
--    RECIPIENT (or admins) to select rows.  The sender could never read
--    back the messages they sent, so the Sent tab was always empty for
--    regular users.  Add a sender-read policy.
-- 2. push_log table — the send-push Edge Function records every send
--    attempt here so delivery problems are visible in the admin panel
--    instead of failing silently (pg_net is fire-and-forget).
-- 3. Recreate trigger_push_notification with an explicit ::text cast on
--    the pg_net body (defensive — pg_net's body parameter is text).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sent folder fix — allow senders to read their own sent messages
-- ---------------------------------------------------------------------
drop policy if exists "inbox_read_sent" on public.inbox_messages;
create policy "inbox_read_sent" on public.inbox_messages for select
  using (sender_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. push_log — delivery log written by the Edge Function (service role
--    bypasses RLS; admins can read it in Settings → Notifications).
-- ---------------------------------------------------------------------
create table if not exists public.push_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  recipient_id uuid,
  key          text not null default '',
  status       text not null,            -- sent | skipped | error | unauthorized
  detail       text not null default '', -- human-readable reason / error message
  sent_count   int  not null default 0
);

create index if not exists push_log_created_idx on public.push_log(created_at desc);

alter table public.push_log enable row level security;
drop policy if exists "pl_admin_read" on public.push_log;
create policy "pl_admin_read" on public.push_log for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ---------------------------------------------------------------------
-- 3. Recreate the push trigger with a defensive ::text cast on body
-- ---------------------------------------------------------------------
create or replace function public.trigger_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bearer text;
  edge_url text;
begin
  select value into bearer  from public.app_secrets where key = 'edge_bearer';
  select value into edge_url from public.app_secrets where key = 'edge_url';
  if bearer is null or edge_url is null then
    -- Setup not finished yet — silently skip. Admin configures app_secrets.
    return new;
  end if;

  perform net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || bearer,
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      'recipient_id',        new.recipient_id,
      'inbox_id',            new.id,
      'inbox_type',          new.type,
      'notification_key',    coalesce(new.notification_key, ''),
      'title',               new.title,
      'body',                new.body,
      'action_url',          coalesce(new.action_url, ''),
      'metadata',            coalesce(new.metadata, '{}'::jsonb)
    )::text
  );
  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';
