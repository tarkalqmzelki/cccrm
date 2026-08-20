-- =====================================================================
-- Calista Concept — schema53.sql
-- Run AFTER schema.sql through schema52.sql.
--
-- Adds `custom_placeholders` JSONB column to contract_templates so the
-- admin can define their own {placeholders} (e.g. {payable},
-- {delivery_date}) in addition to the built-in ones.  Each placeholder
-- is { key, label, type } — the key is what goes in the template body,
-- the label is shown in the contract editor, the type controls the
-- input (text / number / date / textarea).
--
-- Per-contract VALUES for those placeholders are stored in the
-- contract's `notes` column as a JSON envelope (same pattern as
-- invoices — backwards-compatible with plain text).
-- =====================================================================

alter table public.contract_templates
  add column if not exists custom_placeholders jsonb not null default '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
