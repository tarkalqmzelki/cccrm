-- =====================================================================
-- Calista Concept — schema2.sql
-- Additions on top of schema.sql. Run AFTER schema.sql. Idempotent.
--
-- Adds: settings table, profile fields (address, avatar_url,
-- custom_commission_pct), deal custom_commission_pct.
-- =====================================================================

-- ---------- PROFILE COLUMNS ----------
alter table public.profiles add column if not exists address text default '';
alter table public.profiles add column if not exists avatar_url text default '';
alter table public.profiles add column if not exists custom_commission_pct numeric(5,2);

-- ---------- DEAL COLUMNS ----------
alter table public.deals add column if not exists custom_commission_pct numeric(5,2);

-- =====================================================================
-- SETTINGS  (singleton row, id = 1)
-- =====================================================================
create table if not exists public.settings (
  id                      int primary key default 1 check (id = 1),
  l1_threshold            numeric(14,2) not null default 0,
  l2_threshold            numeric(14,2) not null default 5000,
  l3_threshold            numeric(14,2) not null default 15000,
  l1_commission_pct       numeric(5,2)  not null default 10,
  l2_commission_pct       numeric(5,2)  not null default 15,
  l3_commission_pct       numeric(5,2)  not null default 20,
  referral_commission_pct numeric(5,2)  not null default 5,
  updated_at              timestamptz   not null default now()
);

-- Seed the singleton
insert into public.settings (id) values (1)
  on conflict (id) do nothing;

-- updated_at trigger
drop trigger if exists trg_settings_touch on public.settings;
create trigger trg_settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.settings enable row level security;
drop policy if exists "settings_read"     on public.settings;
drop policy if exists "settings_admin_all" on public.settings;
create policy "settings_read"     on public.settings for select using (true);
create policy "settings_admin_all" on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- DONE — settings are now editable from the admin Settings tab.
-- =====================================================================
