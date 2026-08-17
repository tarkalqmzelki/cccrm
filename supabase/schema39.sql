-- =====================================================================
-- Calista Concept — schema39.sql
-- Run AFTER schema.sql through schema38.sql.
--
-- Switch from fragile pg_net trigger to Supabase Database Webhook +
-- battle-tested `web-push` npm library.  Additive only — no breaking
-- changes to existing data.
--
-- 1. Add `subscription jsonb` column to push_subscriptions and backfill
--    from existing endpoint/p256dh/auth_key columns so already-
--    subscribed phones keep working without re-subscribing.
-- 2. Drop the pg_net trigger + its function (replaced by a Database
--    Webhook configured in the Supabase dashboard — see README).
--    The `app_secrets` row `edge_url` is no longer read by the trigger
--    (it's gone); we leave the row in place for compatibility, it's
--    harmless.
-- 3. Keep everything else: push_log, templates, preferences, the
--    daily-reminders cron (still uses pg_net — separate concern).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. push_subscriptions.subscription jsonb column (additive)
-- ---------------------------------------------------------------------
alter table public.push_subscriptions
  add column if not exists subscription jsonb;

-- Backfill the new column from the legacy per-field columns so existing
-- subscriptions continue to work with the new Edge Function (which
-- prefers `subscription` but falls back to building from the legacy
-- fields if `subscription` is null).
update public.push_subscriptions
  set subscription = jsonb_build_object(
    'endpoint', endpoint,
    'keys', jsonb_build_object(
      'p256dh', p256dh,
      'auth',   auth_key
    )
  )
  where subscription is null
    and endpoint is not null
    and p256dh   is not null
    and auth_key is not null;

-- ---------------------------------------------------------------------
-- 2. Drop the pg_net push trigger + its function.
--    Replaced by a Database Webhook configured in the dashboard.
--    (See the setup instructions printed at the bottom of this file in
--    the project README — we'll cover it in the chat.)
-- ---------------------------------------------------------------------
drop trigger if exists trg_notify_push on public.inbox_messages;
drop function if exists public.trigger_push_notification();
drop function if exists public.http_post(text, jsonb, jsonb);

-- Leave the `edge_url` row in app_secrets — it's no longer read by the
-- trigger (which is now gone).  Leaving it avoids breaking any other
-- code that might reference it; it's harmless dead data.

NOTIFY pgrst, 'reload schema';
