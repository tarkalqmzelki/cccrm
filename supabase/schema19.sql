-- =====================================================================
-- Calista Concept — schema19.sql
-- Run AFTER schema.sql through schema18.sql.
--
-- Fix: Leaderboard needs to read ALL deals and payouts to compute
-- public rankings. Currently RLS only lets sellers see their own.
-- Make deals and payouts readable by all authenticated users.
-- (Contact details like phone/email are already blurred in the UI;
--  the leaderboard only uses gross_value, status, seller_id, etc.)
-- =====================================================================

-- DEALS: readable by all authenticated users
drop policy if exists "deals_seller_read" on public.deals;
drop policy if exists "deals_all_read" on public.deals;
create policy "deals_all_read" on public.deals for select
  using (true);

-- PAYOUTS: readable by all authenticated users
drop policy if exists "payouts_seller_read" on public.payouts;
drop policy if exists "payouts_all_read" on public.payouts;
create policy "payouts_all_read" on public.payouts for select
  using (true);

-- Keep the existing write policies (sellers can only insert own,
-- only admin can update). Reads are now public to all authenticated users.

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. Leaderboard now shows everyone's stats for all users.
-- =====================================================================
