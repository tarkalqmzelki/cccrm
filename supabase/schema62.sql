-- =====================================================================
-- Calista Concept — schema62.sql
-- Run AFTER schema61.sql.  HOTFIX for the PostgREST schema-cache error
-- ("Could not find the 'phone' column of 'marketplace_leads'") — adds
-- the phone columns if they're missing and forces a schema reload.
-- Safe to run multiple times.
-- =====================================================================

alter table public.marketplace_leads
  add column if not exists phone text not null default '';

alter table public.companies
  add column if not exists phone text not null default '';

NOTIFY pgrst, 'reload schema';
