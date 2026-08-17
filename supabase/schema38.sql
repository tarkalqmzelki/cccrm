-- =====================================================================
-- Calista Concept — schema38.sql
-- Run AFTER schema.sql through schema37.sql.
--
-- Reorganize the admin Settings tab:
--   1. error_logs   — generic platform error log, any code can write.
--                     LogBook shows every error in one place.
--   2. changelog    — versioned release notes with labels
--                     (NEW, IMPROVEMENT, FIX, TODO, ANNOUNCEMENT).
--                     Visible to ALL users in the sidebar above the
--                     system status pill.  Managed by admins.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. error_logs — generic platform error log
-- ---------------------------------------------------------------------
create table if not exists public.error_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  source      text not null default '',     -- 'push', 'auth', 'inbox', 'deals', 'payouts', ...
  severity    text not null default 'error',-- 'info' | 'warn' | 'error'
  message     text not null,                -- short title
  detail      text not null default '',     -- stack trace / extra context
  actor_id    uuid references public.profiles(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb
);

create index if not exists err_logs_created_idx on public.error_logs(created_at desc);
create index if not exists err_logs_source_idx  on public.error_logs(source);

alter table public.error_logs enable row level security;
-- Anyone authenticated can read (so they could surface context in
-- their own sessions if needed); only admins can write via the UI.
-- Code-side inserts use the service role (bypasses RLS).
drop policy if exists "err_read" on public.error_logs;
drop policy if exists "err_admin_write" on public.error_logs;
create policy "err_read" on public.error_logs for select
  using (true);
create policy "err_admin_write" on public.error_logs for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- 2. changelog — release notes with labels
-- ---------------------------------------------------------------------
do $$ begin
  create type public.changelog_label as enum (
    'NEW', 'IMPROVEMENT', 'FIX', 'TODO', 'ANNOUNCEMENT'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.changelog (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  label       public.changelog_label not null default 'NEW',
  version     text not null default '',     -- e.g. "1.15" — optional
  title       text not null,
  body        text not null default '',
  published   boolean not null default true, -- drafts stay hidden from users
  created_by  uuid references public.profiles(id) on delete set null
);

create index if not exists changelog_created_idx on public.changelog(created_at desc);

alter table public.changelog enable row level security;
-- All authenticated users see published entries.  Admins see and edit
-- everything (including drafts).
drop policy if exists "cl_user_read" on public.changelog;
drop policy if exists "cl_admin_all" on public.changelog;
create policy "cl_user_read" on public.changelog for select
  using (published = true);
create policy "cl_admin_all" on public.changelog for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Seed a couple of starter entries so the pill isn't empty on day 1.
insert into public.changelog (label, version, title, body, published)
select 'NEW', '1.15', 'Push notifications',
       'Background push notifications for inbox messages, deal approvals, payouts, and daily admin reminders.',
       true
where not exists (select 1 from public.changelog);

insert into public.changelog (label, version, title, body, published)
select 'IMPROVEMENT', '1.15', 'Settings reorganization',
       'Admin Settings is now organized into categories with a sidebar: commissions, notifications, system, logbook, and changelog.',
       true
where not exists (select 1 from public.changelog where title = 'Settings reorganization');

NOTIFY pgrst, 'reload schema';
