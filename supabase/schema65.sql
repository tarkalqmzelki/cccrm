-- =====================================================================
-- Calista Concept — schema65.sql
-- Run AFTER schema64.sql.
--
-- CHALLENGE FLOWS — visual rule builder (n8n-style) for functional
-- challenges. rule_flow stores the authored node graph; simple
-- functional_type/target_count remain the fallback when null.
-- =====================================================================

alter table public.challenges
  add column if not exists rule_flow jsonb;

NOTIFY pgrst, 'reload schema';
