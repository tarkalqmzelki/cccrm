-- =====================================================================
-- Calista Concept — schema49.sql
-- Run AFTER schema.sql through schema48.sql.
--
-- 1. show_in_leaderboard column on profiles (default true).  Lets
--    admins exclude specific members from all leaderboards without
--    deactivating their account.  Toggled from Sidebar → Sellers →
--    Edit Account.
-- 2. user_chat notification template + trigger on chat_messages
--    INSERT that fan-outs one inbox_messages row per OTHER active
--    user (so everyone in the general chat gets a push when someone
--    posts, except the poster themselves).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. show_in_leaderboard column on profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists show_in_leaderboard boolean not null default true;

-- Backfill existing rows so they default to visible.
update public.profiles
  set show_in_leaderboard = true
  where show_in_leaderboard is null;

-- Allow admins to update this column.  RLS already permits admins
-- to update profiles; this just exposes the column.  No policy change
-- needed — the existing admin update policy covers the new column.

-- ---------------------------------------------------------------------
-- 2. user_chat notification template + chat_messages trigger
-- ---------------------------------------------------------------------
insert into public.notification_templates (key, enabled, title_template, body_template, tone) values
  ('user_chat', true, '{subject}', '{body}', 'normal')
on conflict (key) do nothing;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender record;
  other record;
  body_preview text;
begin
  -- Look up the sender so we can include their name in the title.
  select id, full_name into sender from public.profiles where id = new.sender_id;

  -- Don't notify on deleted messages (defensive; INSERT trigger only)
  if sender.id is null then
    return new;
  end if;

  -- Truncate body for the push (push bodies > ~200 chars get truncated
  -- by the OS anyway).
  body_preview := left(coalesce(new.body, ''), 140);

  -- Fan out to every OTHER active user (excluding the sender).
  for other in
    select id from public.profiles
      where active = true
      and id is distinct from new.sender_id
  loop
    -- Wrap each insert in its own BEGIN/EXCEPTION/END so one bad
    -- recipient doesn't abort the whole batch.  (exception is a
    -- clause of a begin/end block, not of a loop iteration.)
    begin
      insert into public.inbox_messages (
        recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
      ) values (
        other.id,
        new.sender_id,
        'system',
        coalesce(sender.full_name, 'Someone') || ' posted in the general chat',
        body_preview,
        '/inbox',
        jsonb_build_object(
          'kind', 'chat_message',
          'chat_message_id', new.id,
          'actor_id', new.sender_id,
          'actor_name', coalesce(sender.full_name, 'Someone')
        ),
        'user_chat'
      );
    exception when others then
      -- Don't let one bad recipient stop the batch.
      null;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_chat_message on public.chat_messages;
create trigger trg_notify_chat_message
  after insert on public.chat_messages
  for each row execute function public.notify_chat_message();

NOTIFY pgrst, 'reload schema';
