-- =====================================================================
-- Calista Concept — schema76.sql
-- Run AFTER schema75.sql.
--
-- HOTFIX 2: CX RPCs still failing after pgcrypto is enabled.
--
-- Root cause: on hosted Supabase, `create extension pgcrypto` installs
-- digest() into the EXTENSIONS schema — but every client-experience
-- function runs with `set search_path = public`, so digest() cannot be
-- resolved and every call fails before validating the token.
-- This re-points all CX functions at public + extensions.
-- Safe to run multiple times.
-- =====================================================================

create extension if not exists pgcrypto;

alter function public.cx_get_state(text)                          set search_path = public, extensions;
alter function public.cx_accept_proposal(text, text)              set search_path = public, extensions;
alter function public.cx_decline_proposal(text, text)             set search_path = public, extensions;
alter function public.cx_approve_contract(text)                   set search_path = public, extensions;
alter function public.cx_submit_onboarding(text, jsonb)           set search_path = public, extensions;
alter function public.cx_send_message(text, text)                 set search_path = public, extensions;
alter function public.cx_approve_milestone(text, uuid)            set search_path = public, extensions;
alter function public.cx_request_change(text, uuid, text)         set search_path = public, extensions;

-- The token-mint helpers from schema67 also rely on digest-adjacent
-- crypto only client-side, but give them the same safety:
alter function public.mint_credits(uuid, numeric, text, text, text) set search_path = public, extensions;
alter function public.credit_balance(uuid)                        set search_path = public, extensions;
alter function public.credit_rate(text)                           set search_path = public, extensions;
alter function public.redeem_voucher(uuid)                        set search_path = public, extensions;
alter function public.convert_points(uuid, numeric)               set search_path = public, extensions;

NOTIFY pgrst, 'reload schema';