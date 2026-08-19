-- =====================================================================
-- Calista Concept — schema51.sql
-- Run AFTER schema.sql through schema50.sql.
--
-- invoice_settings — single-row table holding the ISSUER identity +
-- default templates that prefill every new invoice.  Avoids the
-- admin re-typing the company's VAT, bank details, legal footnote,
-- signature name on each invoice.  All fields are free-form text.
-- =====================================================================

create table if not exists public.invoice_settings (
  id                       int primary key default 1,
  -- Issuer identity (the "From" block on every invoice)
  company_name             text not null default 'Calista Concept',
  company_subname          text not null default 'Legendary Design Ltd.',
  company_address          text not null default '',
  company_email            text not null default 'ops@calistaconcept.eu',
  company_phone            text not null default '',
  company_website          text not null default '',
  company_vat              text not null default '',
  company_id               text not null default '',
  -- Default templates that prefill the optional sections of a new
  -- invoice in the editor.  Each is a JSON object so we can store
  -- structured fields (bank) or plain text (legal/signature/terms).
  default_bank             jsonb not null default '{}'::jsonb,
  default_legal_notes      text not null default '',
  default_signature_name   text not null default '',
  default_payment_terms    text not null default '',
  -- QR verification base URL — the QR code on every invoice encodes
  -- `{base}/{invoice_id}`.  Defaults to the production domain.
  qr_verify_base_url       text not null default 'https://calistaconcept.eu/invoice/verify',
  updated_at               timestamptz not null default now(),
  constraint invoice_settings_singleton check (id = 1)
);

-- Seed the single row if it doesn't exist.
insert into public.invoice_settings (id)
select 1
where not exists (select 1 from public.invoice_settings);

alter table public.invoice_settings enable row level security;
drop policy if exists "invset_admin_all" on public.invoice_settings;
create policy "invset_admin_all" on public.invoice_settings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Anonymous SELECT so the public verify route can read the issuer
-- name + logo for the "this invoice is valid" page.  We expose only
-- the issuer identity (no templates, no secrets).
drop policy if exists "invset_public_read" on public.invoice_settings;
create policy "invset_public_read" on public.invoice_settings for select
  using (true);

-- Anonymous SELECT on invoices so the public verify route can confirm
-- an invoice exists by ID.  Voided invoices are also readable so the
-- page can show "not valid" rather than a 404.
drop policy if exists "inv_public_read_status" on public.invoices;
create policy "inv_public_read_status" on public.invoices for select
  using (true);

-- Anonymous SELECT on invoice_services so the verify page can show
-- the line items + total amount when confirming an invoice.
drop policy if exists "inv_svc_public_read" on public.invoice_services;
create policy "inv_svc_public_read" on public.invoice_services for select
  using (true);

NOTIFY pgrst, 'reload schema';
