-- =====================================================================
-- Calista Concept — schema11.sql
-- Run AFTER schema.sql through schema10.sql.
--
-- 1. Add logo_url to companies
-- 2. Ensure every profile has a uid (backfill + force)
-- 3. Refresh schema cache
-- =====================================================================

-- ---------- COMPANY LOGO ----------
alter table public.companies
  add column if not exists logo_url text default '';

-- ---------- ENSURE UID ON EVERY PROFILE ----------
-- Backfill any profiles that still don't have a uid
update public.profiles
  set uid = upper(substr(encode(gen_random_bytes(4),'hex'),1,6))
where uid is null or uid = '';

-- Make uid NOT NULL so it's always present
alter table public.profiles
  alter column uid set not null;

-- ---------- REFRESH SCHEMA CACHE ----------
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE.
-- =====================================================================
