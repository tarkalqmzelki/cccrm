-- =====================================================================
-- Calista Concept — schema21.sql
-- Run AFTER schema.sql through schema20.sql.
--
-- Add DELETE policy for companies (creator + admin only)
-- =====================================================================

drop policy if exists "companies_creator_delete" on public.companies;
create policy "companies_creator_delete" on public.companies for delete
  using (created_by = auth.uid() or public.is_admin());

NOTIFY pgrst, 'reload schema';
