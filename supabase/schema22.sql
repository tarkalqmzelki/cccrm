-- =====================================================================
-- Calista Concept — schema22.sql
-- Run AFTER schema.sql through schema21.sql.
--
-- 1. Ensure created_by column exists on companies
-- 2. Add trigger to auto-set created_by = auth.uid() on insert
-- 3. Backfill any companies missing created_by
-- =====================================================================

-- Ensure column exists
alter table public.companies
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Backfill: assign to first opportunity owner
update public.companies c
  set created_by = (
    select o.owner_id from public.opportunities o
    where o.company_id = c.id
    order by o.created_at asc
    limit 1
  )
where c.created_by is null;

-- Trigger: auto-set created_by on insert
create or replace function public.set_company_creator()
returns trigger language plpgsql security definer as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_set_company_creator on public.companies;
create trigger trg_set_company_creator
  before insert on public.companies
  for each row execute function public.set_company_creator();

-- Ensure the update policy for creator exists
drop policy if exists "companies_creator_update" on public.companies;
create policy "companies_creator_update" on public.companies for update
  using (created_by = auth.uid() or public.is_admin());

NOTIFY pgrst, 'reload schema';
