-- =====================================================================
-- Calista Concept — schema24.sql
-- Run AFTER schema.sql through schema23.sql.
--
-- 1. system_status table — one row per tracked platform system.
--    Seeded with the four systems shown in the status modal:
--      CCCRM, CLS Finance, CLST Payouts, CLST Deals
-- 2. RLS: any authenticated user can read (status modal),
--         only admins can upsert / update / delete.
-- =====================================================================

do $$ begin
  create type public.system_status_value as enum ('operating', 'maintenance', 'down');
exception when duplicate_object then null; end $$;

create table if not exists public.system_status (
  id           uuid primary key default gen_random_uuid(),
  system       text not null unique,
  status       public.system_status_value not null default 'operating',
  uptime_pct   numeric(5,2) not null default 99.99 check (uptime_pct >= 0 and uptime_pct <= 100),
  note         text not null default '',
  updated_at   timestamptz not null default now()
);

create index if not exists system_status_sys_idx on public.system_status(system);

alter table public.system_status enable row level security;

drop policy if exists "system_status_read"   on public.system_status;
drop policy if exists "system_status_write"  on public.system_status;
drop policy if exists "system_status_insert" on public.system_status;
drop policy if exists "system_status_delete" on public.system_status;

-- Anyone authenticated can read the current platform status
create policy "system_status_read" on public.system_status for select
  using (true);

-- Admins can update (toggle status, edit uptime/note)
create policy "system_status_write" on public.system_status for update
  using (public.is_admin()) with check (public.is_admin());

-- Admins can insert new systems
create policy "system_status_insert" on public.system_status for insert
  with check (public.is_admin());

-- Admins can delete systems
create policy "system_status_delete" on public.system_status for delete
  using (public.is_admin());

-- Updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_system_status_touch on public.system_status;
create trigger trg_system_status_touch
  before update on public.system_status
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Seed the four systems (idempotent)
-- ---------------------------------------------------------------------
insert into public.system_status (system, status, uptime_pct, note)
values
  ('CCCRM',        'operating', 99.99, 'Main referral & revenue platform'),
  ('CLS Finance',  'operating', 99.99, 'Finance / commission engine'),
  ('CLST Payouts', 'operating', 99.99, 'Payout processing'),
  ('CLST Deals',   'operating', 99.99, 'Deal submission & approval')
on conflict (system) do nothing;

NOTIFY pgrst, 'reload schema';