-- =====================================================================
-- Calista Concept — schema52.sql
-- Run AFTER schema.sql through schema51.sql.
--
-- 1. contract_templates — admin-managed text templates (markdown with
--    placeholders like {counterparty_name}, {company_name}, {date}, …)
--    that get filled in when a contract is generated.
-- 2. contracts — header table (number, counterparty, dates, status,
--    template_id FK, extras JSON for optional fields).
-- 3. invoices.contract_ref — text column so an invoice can reference
--    a contract by its number (lightweight link — no FK, just a
--    human-readable reference string shown on both surfaces).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. contract_templates
-- ---------------------------------------------------------------------
create table if not exists public.contract_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                        -- "Service Agreement", "NDA", …
  description text not null default '',
  body        text not null default '',              -- markdown with {placeholders}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);

create index if not exists ct_name_idx on public.contract_templates(name);

alter table public.contract_templates enable row level security;
drop policy if exists "ct_admin_all" on public.contract_templates;
create policy "ct_admin_all" on public.contract_templates for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- 2. contracts
-- ---------------------------------------------------------------------
create table if not exists public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  number               text not null unique,         -- CC-CTR-2026-A7F3B2
  template_id          uuid references public.contract_templates(id) on delete set null,
  status               text not null default 'draft'
                         check (status in ('draft','active','expired','terminated','void')),
  -- Counterparty ("Who is the contact with")
  counterparty_name    text not null default '',
  counterparty_company text not null default '',
  counterparty_address text not null default '',
  counterparty_phone   text not null default '',
  counterparty_email   text not null default '',
  counterparty_vat     text not null default '',
  -- Dates
  issue_date           date not null default current_date,
  start_date           date,
  end_date             date,
  -- Freeform notes + structured extras (JSON in `notes`, same pattern
  -- as invoices — backwards-compatible with plain text)
  notes                text not null default '',
  -- Linked finance entry (when a contract generates revenue — same
  -- pattern as invoices, future use)
  finance_entry_id     uuid references public.finance_entries(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id) on delete set null
);

create index if not exists ctr_number_idx on public.contracts(number);
create index if not exists ctr_status_idx on public.contracts(status);
create index if not exists ctr_template_idx on public.contracts(template_id);

alter table public.contracts enable row level security;
drop policy if exists "ctr_admin_all" on public.contracts;
create policy "ctr_admin_all" on public.contracts for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- 3. invoices.contract_ref — link an invoice to a contract
-- ---------------------------------------------------------------------
alter table public.invoices
  add column if not exists contract_ref text not null default '';

NOTIFY pgrst, 'reload schema';
