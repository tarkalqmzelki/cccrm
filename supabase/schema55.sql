-- =====================================================================
-- Calista Concept — schema55.sql
-- Run AFTER schema.sql through schema54.sql.
--
-- 1. invoice_settings: logo_url_light + logo_url_dark columns so the
--    admin can set different logos for light/dark mode.
-- 2. system_status: seed CCInvoiceEngine + CCContractEngine rows.
-- =====================================================================

alter table public.invoice_settings
  add column if not exists logo_url_light text not null default '';
alter table public.invoice_settings
  add column if not exists logo_url_dark text not null default '';

-- Seed the two new system_status rows (idempotent)
insert into public.system_status (system, status, uptime_pct, note)
values
  ('CCInvoiceEngine', 'operating', 99.99, 'Invoice generation + PDF rendering'),
  ('CCContractEngine', 'operating', 99.99, 'Contract generation + template engine')
on conflict (system) do nothing;

NOTIFY pgrst, 'reload schema';
