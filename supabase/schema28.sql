-- =====================================================================
-- Calista Concept — schema28.sql
-- Run AFTER schema.sql through schema27.sql.
--
-- 1. Extend the inbox_messages table with email-like fields:
--      priority (sender-set)       low | normal | high | urgent
--      priority_override           recipient can downgrade the priority
--      category (sender-set)        free-form label
--      category_override            recipient can re-label
--      is_starred                   recipient can star
--      folder                       inbox | archive | trash
--      thread_id / parent_id        reply / forward threading
-- 2. Add 'activity_assigned' + 'activity_reassigned' to the inbox_type
--    enum so the new "assign activity to another user" flow can land in
--    the receiver's inbox with a proper icon.
-- 3. Relax RLS on scheduled_activities so any authenticated user can
--    create / update activities owned by anyone (enabling the
--    "Users not only admins can set the activities to different users"
--    feature).  Delete stays owner-or-admin.
-- 4. Add a trigger that drops an inbox notification into the new owner's
--    mailbox whenever an activity is created for them, or reassigned to
--    them, by another member.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend inbox_type enum (idempotent)
-- ---------------------------------------------------------------------
do $$ begin
  alter type public.inbox_type add value if not exists 'activity_assigned';
exception when others then null; end $$;
do $$ begin
  alter type public.inbox_type add value if not exists 'activity_reassigned';
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- 2. New columns on inbox_messages
-- ---------------------------------------------------------------------
alter table public.inbox_messages
  add column if not exists priority          text      not null default 'normal',
  add column if not exists priority_override text,
  add column if not exists category          text      not null default '',
  add column if not exists category_override text,
  add column if not exists is_starred        boolean   not null default false,
  add column if not exists folder            text      not null default 'inbox',
  add column if not exists thread_id         uuid,
  add column if not exists parent_id         uuid;

-- Sanity-check constraint on priority values
do $$ begin
  alter table public.inbox_messages
    add constraint inbox_priority_chk
    check (priority in ('low', 'normal', 'high', 'urgent'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inbox_messages
    add constraint inbox_priority_override_chk
    check (priority_override is null or priority_override in ('low', 'normal', 'high', 'urgent'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inbox_messages
    add constraint inbox_folder_chk
    check (folder in ('inbox', 'archive', 'trash'));
exception when duplicate_object then null; end $$;

-- Indexes for the common views
create index if not exists inbox_sender_idx    on public.inbox_messages(sender_id);
create index if not exists inbox_thread_idx   on public.inbox_messages(thread_id);
create index if not exists inbox_folder_idx   on public.inbox_messages(recipient_id, folder);
create index if not exists inbox_starred_idx  on public.inbox_messages(recipient_id, is_starred) where is_starred = true;

-- Self-reference for thread / parent (after the columns exist)
do $$ begin
  alter table public.inbox_messages
    add constraint inbox_parent_fk
    foreign key (parent_id) references public.inbox_messages(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inbox_messages
    add constraint inbox_thread_fk
    foreign key (thread_id) references public.inbox_messages(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Relax RLS on scheduled_activities so any member can assign an
--    activity to another member.  Delete stays owner-or-admin so a
--    stray user can't wipe someone else's calendar.
-- ---------------------------------------------------------------------
drop policy if exists "sa_insert" on public.scheduled_activities;
drop policy if exists "sa_update" on public.scheduled_activities;

-- Any authenticated user can create activities for themselves or others
create policy "sa_insert" on public.scheduled_activities for insert
  with check (true);
-- Any authenticated user can update activities (owner, the original
-- creator, or admin — we don't track "creator" so we permit any
-- authenticated user; the UI hides edit controls for non-owners / non-admins)
create policy "sa_update" on public.scheduled_activities for update
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- 4. Trigger — notify the (new) owner when an activity is assigned
--    to them by someone else.
-- ---------------------------------------------------------------------
create or replace function public.notify_activity_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  title_text text;
  when_text text;
begin
  if actor is null then
    return new;
  end if;

  -- Don't notify when the owner is the actor themselves (regular creation)
  if new.owner_id = actor then
    return new;
  end if;

  select full_name into actor_name
    from public.profiles where id = actor;

  title_text := coalesce(nullif(trim(new.title), ''), 'Untitled activity');
  when_text  := to_char(new.scheduled_at at time zone 'UTC', 'DD Mon YYYY, HH:MI');

  if TG_OP = 'INSERT' then
    insert into public.inbox_messages (
      recipient_id, sender_id, type, title, body, action_url, metadata
    ) values (
      new.owner_id,
      actor,
      'activity_assigned',
      'New activity assigned to you',
      actor_name || ' assigned you: ' || title_text || ' — scheduled for ' || when_text || '.',
      '/kanban',
      jsonb_build_object(
        'kind', 'activity_assigned',
        'activity_id', new.id,
        'actor_id', actor,
        'scheduled_at', new.scheduled_at
      )
    );
  elsif TG_OP = 'UPDATE' then
    -- Only notify when the owner actually changed
    if new.owner_id is distinct from old.owner_id then
      insert into public.inbox_messages (
        recipient_id, sender_id, type, title, body, action_url, metadata
      ) values (
        new.owner_id,
        actor,
        'activity_reassigned',
        'Activity reassigned to you',
        actor_name || ' reassigned to you: ' || title_text || ' — scheduled for ' || when_text || '.',
        '/kanban',
        jsonb_build_object(
          'kind', 'activity_reassigned',
          'activity_id', new.id,
          'actor_id', actor,
          'scheduled_at', new.scheduled_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_activity_owner on public.scheduled_activities;
create trigger trg_notify_activity_owner
  after insert or update of owner_id on public.scheduled_activities
  for each row execute function public.notify_activity_owner();

NOTIFY pgrst, 'reload schema';
