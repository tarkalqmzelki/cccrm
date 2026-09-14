-- =====================================================================
-- Calista Concept — schema75.sql
-- Run AFTER schema74.sql.
--
-- HOTFIX: "This link is not valid" right after activating a link.
-- The CX RPCs use digest(p_token,'sha256') which requires pgcrypto.
-- If the extension is missing, cx_get_state throws before validating
-- anything, and the client page shows "This link is not valid".
-- Safe to run multiple times.
-- =====================================================================

create extension if not exists pgcrypto;

-- Smoke-test: should return {"ok": false, "error": "INVALID"} — NOT an error
-- do $$ begin
--   perform public.cx_get_state('nonexistent-token-smoke-test-1234567890');
-- end $$;

NOTIFY pgrst, 'reload schema';
