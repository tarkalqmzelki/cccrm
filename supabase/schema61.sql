-- =====================================================================
-- Calista Concept — schema61.sql
-- Run AFTER schema60.sql.
--
-- LEADS MARKETPLACE — a pool of import-ready companies admins feed to
-- the team. Rows live OUTSIDE the companies table until claimed:
--   published=false  → hidden from the marketplace (import default)
--   unlock_at        → optional claim timer (null = claimable at once)
--   allocated_to     → reserved for one specific member
--   claimed_by/at    → set on claim; row then spawns a real company
--                      owned by the claimer (created_by = claimer)
-- =====================================================================

create table if not exists public.marketplace_leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  website       text not null default '',
  domain        text not null default '',
  vat_number    text not null default '',
  industry      text not null default '',
  description   text not null default '',
  address       text not null default '',
  logo_url      text not null default '',
  summary       text not null default '',
  phone         text not null default '',
  published     boolean not null default false,
  unlock_at     timestamptz,
  allocated_to  uuid references public.profiles(id) on delete set null,
  claimed_by    uuid references public.profiles(id) on delete set null,
  claimed_at    timestamptz,
  imported_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Phone lives on companies too so claimed leads keep their contact line.
alter table public.companies
  add column if not exists phone text not null default '';

create index if not exists ml_published_idx on public.marketplace_leads(published);
create index if not exists ml_claimed_by_idx on public.marketplace_leads(claimed_by);
create index if not exists ml_allocated_idx on public.marketplace_leads(allocated_to);

alter table public.marketplace_leads enable row level security;

drop policy if exists "ml_read" on public.marketplace_leads;
drop policy if exists "ml_insert" on public.marketplace_leads;
drop policy if exists "ml_update" on public.marketplace_leads;
drop policy if exists "ml_delete" on public.marketplace_leads;

-- Everyone authenticated can read the pool (clients filter visibility).
create policy "ml_read" on public.marketplace_leads for select using (true);

-- Only admins create/remove pool rows.
create policy "ml_insert" on public.marketplace_leads for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "ml_delete" on public.marketplace_leads for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admins update anything. Members may ONLY perform a clean claim:
-- row unclaimed, not reserved for someone else, published, unlocked.
create policy "ml_update" on public.marketplace_leads for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or (
      claimed_by is null
      and published = true
      and (allocated_to is null or allocated_to = auth.uid())
      and (unlock_at is null or unlock_at <= now())
    )
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or claimed_by = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
