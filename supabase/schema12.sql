-- =====================================================================
-- Calista Concept — schema12.sql
-- Run AFTER schema.sql through schema11.sql.
--
-- 1. Add created_by to contacts (for per-seller contact visibility)
-- 2. Backfill existing contacts
-- 3. Refresh schema cache
-- =====================================================================

alter table public.contacts
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Backfill: assign to the first opportunity owner at the company
update public.contacts c
  set created_by = (
    select o.owner_id from public.opportunities o
    where o.company_id = c.company_id
    order by o.created_at asc
    limit 1
  )
where c.created_by is null;

NOTIFY pgrst, 'reload schema';
