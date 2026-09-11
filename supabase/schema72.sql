-- =====================================================================
-- Calista Concept — schema72.sql
-- Run AFTER schema71.sql.
--
-- MARKETPLACE 2.0 — saved category library, import history, indexes
-- for server-side pagination & filtering at any scale.
-- =====================================================================

-- Saved industry categories (library persists even at zero leads)
create table if not exists public.marketplace_industries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.marketplace_industries enable row level security;
drop policy if exists "mi_read" on public.marketplace_industries;
drop policy if exists "mi_write" on public.marketplace_industries;
create policy "mi_read" on public.marketplace_industries for select using (true);
create policy "mi_write" on public.marketplace_industries for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Import history log
create table if not exists public.marketplace_imports (
  id           uuid primary key default gen_random_uuid(),
  imported_by  uuid references public.profiles(id) on delete set null,
  count        int not null default 0,
  industry     text not null default '',
  created_at   timestamptz not null default now()
);

alter table public.marketplace_imports enable row level security;
drop policy if exists "mpimp_read" on public.marketplace_imports;
create policy "mpimp_read" on public.marketplace_imports for select using (true);

-- Seed the library from categories already present in the pool
insert into public.marketplace_industries (name)
select distinct trim(industry) from public.marketplace_leads
where trim(coalesce(industry, '')) <> ''
on conflict (name) do nothing;

-- Speed up category / status filtering
create index if not exists ml_industry_idx on public.marketplace_leads(industry);
create index if not exists ml_published_industry_idx on public.marketplace_leads(published, industry);
create index if not exists ml_unlock_idx on public.marketplace_leads(unlock_at);

NOTIFY pgrst, 'reload schema';