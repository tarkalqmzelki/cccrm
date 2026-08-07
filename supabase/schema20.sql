-- =====================================================================
-- Calista Concept — schema20.sql
-- Run AFTER schema.sql through schema19.sql.
--
-- 1. Rename opportunities → offers (via view alias, keep table name)
--    Actually we keep the table name "opportunities" for backwards
--    compatibility but the app treats them as "Offers" now.
-- 2. Add company_summaries table (cold call summary — public)
-- 3. Add company_followups table (follow-up calls logged by creator)
-- 4. Add offer-specific fields: offer_value, offer_description, service_line
-- 5. Adjust RLS: company edit restricted to creator + admin
-- =====================================================================

-- ---------- ADD SUMMARY COLUMNS TO COMPANIES ----------
alter table public.companies
  add column if not exists summary text default '',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Backfill: assign creator to first opportunity owner
update public.companies c
  set created_by = (
    select o.owner_id from public.opportunities o
    where o.company_id = c.id
    order by o.created_at asc
    limit 1
  )
where c.created_by is null;

-- ---------- ADD OFFER FIELDS TO OPPORTUNITIES ----------
alter table public.opportunities
  add column if not exists offer_value numeric(14,2) not null default 0,
  add column if not exists offer_description text default '';

-- Migrate est_revenue → offer_value if empty
update public.opportunities
  set offer_value = est_revenue
  where offer_value = 0 and est_revenue > 0;

-- ---------- COMPANY FOLLOW-UPS ----------
create table if not exists public.company_followups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  follow_up_date timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists cf_company_idx on public.company_followups(company_id);

alter table public.company_followups enable row level security;
drop policy if exists "cf_read" on public.company_followups;
drop policy if exists "cf_insert" on public.company_followups;
drop policy if exists "cf_delete" on public.company_followups;
create policy "cf_read" on public.company_followups for select using (true);
create policy "cf_insert" on public.company_followups for insert
  with check (true);
create policy "cf_delete" on public.company_followups for delete
  using (author_id = auth.uid() or public.is_admin());

-- ---------- COMPANY EDIT: restrict to creator + admin ----------
drop policy if exists "companies_seller_update" on public.companies;
drop policy if exists "companies_creator_update" on public.companies;
create policy "companies_creator_update" on public.companies for update
  using (created_by = auth.uid() or public.is_admin());

-- Keep insert open (anyone can create a company)
-- Keep select open (everyone can see companies)

-- ---------- OPPORTUNITY(offer) INSERT: restrict to creator of company + admin ----------
drop policy if exists "opp_owner_insert" on public.opportunities;
create policy "opp_owner_insert" on public.opportunities for insert
  with check (
    auth.uid() in (
      select created_by from public.companies where id = company_id
    )
    or public.is_admin()
  );

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE.
-- - Companies have summary + created_by + follow-ups
-- - Opportunities have offer_value + offer_description (used as "Offers")
-- - Company edit restricted to creator + admin
-- - Offer creation restricted to company creator + admin
-- - Summary and follow-ups are public (readable by all)
-- =====================================================================
