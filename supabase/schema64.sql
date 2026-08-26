-- =====================================================================
-- Calista Concept — schema64.sql
-- Run AFTER schema63.sql.
--
-- LEADS GEOGRAPHY + SERVICES — structured fields so the world map and
-- marketplace can rely on real data instead of free-text matching.
-- =====================================================================

alter table public.companies
  add column if not exists country text not null default '',
  add column if not exists city text not null default '',
  add column if not exists services_offered text not null default '';

create index if not exists companies_country_idx on public.companies(country);

NOTIFY pgrst, 'reload schema';
