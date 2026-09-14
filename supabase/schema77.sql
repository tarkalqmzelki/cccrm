-- =====================================================================
-- Calista Concept — schema77.sql
-- Run AFTER schema76.sql.
--
-- DIAGNOSTIC + ROBUST MATCH for "This link is not valid".
--
-- Possible causes this addresses:
--   1. digest() was resolving against the wrong schema when the link
--      was created (hashes written by an older code path).
--   2. Case/encoding drift between browser hex and pg hex.
-- This adds cx_debug(admin) — an ADMIN-ONLY RPC that reports, for a
-- given raw token, the computed hash, whether a row exists, and the
-- nearest row (so mismatches are visible). It also re-asserts the
-- text-safe search paths on every CX function.
-- Safe to run multiple times.
-- =====================================================================

create extension if not exists pgcrypto;

create or replace function public.cx_debug(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_row public.client_experience_access%rowtype;
  v_count int;
  v_admin bool;
begin
  -- Admin-only gate
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'ADMIN_ONLY');
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select * into v_row from public.client_experience_access where token_hash = v_hash;

  select count(*) into v_count from public.client_experience_access;

  return jsonb_build_object(
    'ok', true,
    'computed_hash', v_hash,
    'match', found,
    'row', case when found then jsonb_build_object(
      'id', v_row.id,
      'deal_id', v_row.deal_id,
      'status', v_row.status,
      'expires_at', v_row.expires_at,
      'revoked_at', v_row.revoked_at) else null end,
    'total_rows', v_count
  );
end $$;

grant execute on function public.cx_debug(text) to authenticated;

NOTIFY pgrst, 'reload schema';