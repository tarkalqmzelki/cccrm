-- =====================================================================
-- Calista Concept — schema14.sql
-- Run AFTER schema.sql through schema13.sql.
--
-- 1. Make uid nullable again (fixes create_user null error)
-- 2. Fix create_user to handle uid properly
-- 3. Create access_requests table
-- 4. Create inbox_messages table
-- 5. Create note_comments table (reddit-style)
-- 6. Create note_votes table
-- 7. RLS policies
-- =====================================================================

-- 1. FIX UID — make nullable so create_user doesn't fail
alter table public.profiles alter column uid drop not null;

-- 2. FIX create_user — generate uid server-side, don't require it in profile insert
create or replace function public.create_user(
  p_email    text,
  p_password text,
  p_full_name text default '',
  p_role     text default 'seller',
  p_level    text default 'L1',
  p_phone    text default ''
) returns uuid
language plpgsql security definer as $$
declare
  v_id   uuid;
  v_phone text;
  v_uid  text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create users';
  end if;

  v_id := gen_random_uuid();
  v_phone := nullif(p_phone, '');
  v_uid := upper(substr(encode(gen_random_bytes(4),'hex'),1,6));

  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone
  )
  values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', lower(p_email),
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', v_phone
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    phone = excluded.phone,
    updated_at = now();

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email)),
    'email', lower(p_email), now(), now(), now()
  )
  on conflict (provider, provider_id) do update
    set identity_data = excluded.identity_data, updated_at = now();

  -- Insert profile WITH uid generated server-side
  insert into public.profiles (id, email, full_name, role, level, phone, active, uid)
  values (v_id, lower(p_email), p_full_name, p_role::user_role, p_level::seller_level, p_phone, true, v_uid)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    level = excluded.level,
    phone = excluded.phone,
    uid = coalesce(profiles.uid, excluded.uid),
    updated_at = now();

  return v_id;
end $$;

-- =====================================================================
-- 3. ACCESS REQUESTS
-- =====================================================================
do $$ begin
  create type access_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.access_requests (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid not null references public.profiles(id) on delete cascade,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  opportunity_id  uuid references public.opportunities(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete cascade,
  status          access_request_status not null default 'pending',
  message         text default '',
  created_at      timestamptz not null default now(),
  responded_at    timestamptz
);

create index if not exists ar_requester_idx on public.access_requests(requester_id);
create index if not exists ar_owner_idx on public.access_requests(owner_id);
create index if not exists ar_status_idx on public.access_requests(status);

alter table public.access_requests enable row level security;
drop policy if exists "ar_read" on public.access_requests;
drop policy if exists "ar_insert" on public.access_requests;
drop policy if exists "ar_update" on public.access_requests;
create policy "ar_read" on public.access_requests for select
  using (requester_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
create policy "ar_insert" on public.access_requests for insert
  with check (requester_id = auth.uid());
create policy "ar_update" on public.access_requests for update
  using (owner_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 4. INBOX MESSAGES
-- =====================================================================
do $$ begin
  create type inbox_type as enum ('access_request', 'access_approved', 'access_rejected', 'note_reply', 'note_vote', 'admin_grant', 'system');
exception when duplicate_object then null; end $$;

create table if not exists public.inbox_messages (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  sender_id     uuid references public.profiles(id) on delete set null,
  type          inbox_type not null default 'system',
  title         text not null default '',
  body          text default '',
  read          boolean not null default false,
  action_url    text default '',
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists inbox_recipient_idx on public.inbox_messages(recipient_id);
create index if not exists inbox_read_idx on public.inbox_messages(recipient_id, read);

alter table public.inbox_messages enable row level security;
drop policy if exists "inbox_read" on public.inbox_messages;
drop policy if exists "inbox_insert" on public.inbox_messages;
drop policy if exists "inbox_update" on public.inbox_messages;
drop policy if exists "inbox_delete" on public.inbox_messages;
create policy "inbox_read" on public.inbox_messages for select
  using (recipient_id = auth.uid() or public.is_admin());
create policy "inbox_insert" on public.inbox_messages for insert
  with check (true);
create policy "inbox_update" on public.inbox_messages for update
  using (recipient_id = auth.uid() or public.is_admin());
create policy "inbox_delete" on public.inbox_messages for delete
  using (recipient_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 5. NOTE COMMENTS (reddit-style on company_notes)
-- =====================================================================
create table if not exists public.note_comments (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.company_notes(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  body          text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists nc_parent_idx on public.note_comments(parent_id);

alter table public.note_comments enable row level security;
drop policy if exists "nc_read" on public.note_comments;
drop policy if exists "nc_insert" on public.note_comments;
drop policy if exists "nc_delete" on public.note_comments;
create policy "nc_read" on public.note_comments for select using (true);
create policy "nc_insert" on public.note_comments for insert with check (true);
create policy "nc_delete" on public.note_comments for delete using (author_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 6. NOTE VOTES (up/down on company_notes and note_comments)
-- =====================================================================
do $$ begin
  create type vote_type as enum ('up', 'down');
exception when duplicate_object then null; end $$;

create table if not exists public.note_votes (
  id            uuid primary key default gen_random_uuid(),
  voter_id      uuid not null references public.profiles(id) on delete cascade,
  note_id       uuid references public.company_notes(id) on delete cascade,
  comment_id    uuid references public.note_comments(id) on delete cascade,
  vote          vote_type not null,
  created_at    timestamptz not null default now(),
  check (note_id is not null or comment_id is not null)
);

create unique index if not exists nv_note_uniq on public.note_votes(voter_id, note_id) where note_id is not null;
create unique index if not exists nv_comment_uniq on public.note_votes(voter_id, comment_id) where comment_id is not null;

alter table public.note_votes enable row level security;
drop policy if exists "nv_read" on public.note_votes;
drop policy if exists "nv_insert" on public.note_votes;
drop policy if exists "nv_delete" on public.note_votes;
create policy "nv_read" on public.note_votes for select using (true);
create policy "nv_insert" on public.note_votes for insert with check (voter_id = auth.uid());
create policy "nv_delete" on public.note_votes for delete using (voter_id = auth.uid());

-- =====================================================================
-- TRIGGER: auto-create inbox message on access request
-- =====================================================================
create or replace function public.notify_access_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
  values (
    new.owner_id,
    new.requester_id,
    'access_request',
    'New access request',
    coalesce(
      (select full_name from public.profiles where id = new.requester_id), 'Someone'
    ) || ' requested access to your lead.',
    '/inbox',
    jsonb_build_object('request_id', new.id, 'company_id', new.company_id, 'opportunity_id', new.opportunity_id)
  );
  return new;
end $$;

drop trigger if exists trg_notify_access_request on public.access_requests;
create trigger trg_notify_access_request
  after insert on public.access_requests
  for each row execute function public.notify_access_request();

-- Trigger: notify on approval/rejection
create or replace function public.notify_access_response()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and coalesce(new.status,'') <> coalesce(old.status,'') then
    insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
    values (
      new.requester_id,
      new.owner_id,
      case when new.status = 'approved' then 'access_approved' else 'access_rejected' end,
      case when new.status = 'approved' then 'Access approved!' else 'Access request declined' end,
      case when new.status = 'approved'
        then 'Your access request has been approved. You can now view the lead details.'
        else 'Your access request was declined.' end,
      coalesce(
        (select '/leads/' || company_id::text from public.opportunities where id = new.opportunity_id),
        '/leads'
      ),
      jsonb_build_object('request_id', new.id)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_access_response on public.access_requests;
create trigger trg_notify_access_response
  after update on public.access_requests
  for each row execute function public.notify_access_response();

-- Trigger: notify on note comment (notify note author)
create or replace function public.notify_note_comment()
returns trigger language plpgsql security definer as $$
declare
  v_note_author uuid;
  v_commenter_name text;
begin
  select author_id into v_note_author from public.company_notes where id = new.parent_id;
  if v_note_author is not null and v_note_author <> new.author_id then
    select full_name into v_commenter_name from public.profiles where id = new.author_id;
    insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
    values (
      v_note_author, new.author_id, 'note_reply',
      coalesce(v_commenter_name, 'Someone') || ' replied to your note',
      new.body,
      '',
      jsonb_build_object('comment_id', new.id, 'note_id', new.parent_id)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_note_comment on public.note_comments;
create trigger trg_notify_note_comment
  after insert on public.note_comments
  for each row execute function public.notify_note_comment();

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE.
-- Tables: access_requests, inbox_messages, note_comments, note_votes
-- UID is now nullable (generated server-side in create_user)
-- All UID-based unlock is replaced by request access + inbox
-- =====================================================================
