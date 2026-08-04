-- =====================================================================
-- Calista Concept — schema9.sql
-- Forces Supabase to refresh its schema cache so it picks up the
-- new columns added by schema8.sql (l1_referral_pct, etc.)
-- =====================================================================

-- Method 1: notify PostgREST to reload (works on most Supabase versions)
NOTIFY pgrst, 'reload schema';

-- Method 2: touch the table to invalidate cache (fallback)
DO $$
BEGIN
  -- Re-add the columns with IF NOT EXISTS to be 100% sure they exist
  ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS l1_referral_pct numeric(5,2) NOT NULL DEFAULT 5;

  ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS l2_referral_pct numeric(5,2) NOT NULL DEFAULT 5;

  ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS l3_referral_pct numeric(5,2) NOT NULL DEFAULT 5;

  -- Ensure payouts table also has payout_type
  ALTER TABLE public.payouts
    ADD COLUMN IF NOT EXISTS payout_type text NOT NULL DEFAULT 'sale';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Columns already exist: %', SQLERRM;
END $$;

-- Migrate old single referral_commission_pct if present
UPDATE public.settings
  SET l1_referral_pct = COALESCE(referral_commission_pct, 5),
      l2_referral_pct = COALESCE(referral_commission_pct, 5),
      l3_referral_pct = COALESCE(referral_commission_pct, 5)
WHERE id = 1
  AND (l1_referral_pct = 5 AND l2_referral_pct = 5 AND l3_referral_pct = 5)
  AND referral_commission_pct IS NOT NULL
  AND referral_commission_pct <> 5;

-- Force PostgREST schema cache reload one more time
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. Wait ~5 seconds after running, then retry the app.
-- If it STILL doesn't work, go to Supabase Dashboard > Settings >
-- API > click "Restart" on the PostgREST service, or run:
--   SELECT pg_reload_conf();
-- =====================================================================
