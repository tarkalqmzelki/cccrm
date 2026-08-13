-- =====================================================================
-- Calista Concept — schema26.sql
-- Run AFTER schema.sql through schema25.sql.
--
-- Scheduled activities (meetings, calls, etc.) with optional link to a
-- lead (company) owned by the user, plus threaded comments.
-- Used by the Kanban board + Calendar views shared across the platform.
-- =====================================================================

do $$ begin
  create type public.activity_type as enum (
    'call', 'meeting', 'potential_meeting', 'email', 'task', 'reminder'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_status as enum (
    'planned', 'in_progress', 'completed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.scheduled_activities (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  type           public.activity_type   not null default 'meeting',
  status         public.activity_status not null default 'planned',
  title          text not null default '',
  notes          text not null default '',
  color          text not null default '',
  scheduled_at   timestamptz not null default (now() + interval '1 hour'),
  duration_min   int  not null default 30,
  company_id     uuid references public.companies(id)     on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists sa_owner_idx     on public.scheduled_activities(owner_id);
create index if not exists sa_scheduled_idx on public.scheduled_activities(scheduled_at);
create index if not exists sa_status_idx    on public.scheduled_activities(status);
create index if not exists sa_company_idx   on public.scheduled_activities(company_id);

alter table public.scheduled_activities enable row level security;

drop policy if exists "sa_read"   on public.scheduled_activities;
drop policy if exists "sa_insert" on public.scheduled_activities;
drop policy if exists "sa_update" on public.scheduled_activities;
drop policy if exists "sa_delete" on public.scheduled_activities;

-- All authenticated users can read every activity (shared calendar)
create policy "sa_read"   on public.scheduled_activities for select
  using (true);
create policy "sa_insert" on public.scheduled_activities for insert
  with check (owner_id = auth.uid() or public.is_admin());
create policy "sa_update" on public.scheduled_activities for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy "sa_delete" on public.scheduled_activities for delete
  using (owner_id = auth.uid() or public.is_admin());

-- touch updated_at on update
drop trigger if exists trg_sa_touch on public.scheduled_activities;
create trigger trg_sa_touch
  before update on public.scheduled_activities
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------
create table if not exists public.scheduled_activity_comments (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.scheduled_activities(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists sac_activity_idx on public.scheduled_activity_comments(activity_id);

alter table public.scheduled_activity_comments enable row level security;

drop policy if exists "sac_read"   on public.scheduled_activity_comments;
drop policy if exists "sac_insert" on public.scheduled_activity_comments;
drop policy if exists "sac_delete" on public.scheduled_activity_comments;

create policy "sac_read"   on public.scheduled_activity_comments for select using (true);
create policy "sac_insert" on public.scheduled_activity_comments for insert
  with check (author_id = auth.uid());
create policy "sac_delete" on public.scheduled_activity_comments for delete
  using (author_id = auth.uid() or public.is_admin());

NOTIFY pgrst, 'reload schema';