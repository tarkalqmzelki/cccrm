-- =====================================================================
-- Calista Concept — schema23.sql
-- Run AFTER schema.sql through schema22.sql.
--
-- 1. Extend inbox_type enum with 'direct_message' (email-like messages
--    between platform members, stored in the existing inbox_messages table)
-- 2. Create chat_messages table for the general platform-wide chat
--    triggered by the "Start chat" button in the Inbox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add 'direct_message' to inbox_type enum (idempotent)
-- ---------------------------------------------------------------------
do $$ begin
  alter type public.inbox_type add value if not exists 'direct_message';
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 2. General platform chat — single shared channel
-- ---------------------------------------------------------------------
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists chat_created_idx on public.chat_messages(created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_read"   on public.chat_messages;
drop policy if exists "chat_insert" on public.chat_messages;
drop policy if exists "chat_delete" on public.chat_messages;

-- Any authenticated user can read the general chat (visible to all members)
create policy "chat_read"   on public.chat_messages for select
  using (true);
-- A member can only post as themselves
create policy "chat_insert" on public.chat_messages for insert
  with check (sender_id = auth.uid());
-- A member can delete their own messages; admins can delete any
create policy "chat_delete" on public.chat_messages for delete
  using (sender_id = auth.uid() or public.is_admin());

-- Enable realtime for chat_messages so subscribers get new posts live
alter publication supabase_realtime add table public.chat_messages;

NOTIFY pgrst, 'reload schema';