-- =====================================================================
-- Calista Concept — schema50.sql
-- Run AFTER schema.sql through schema49.sql.
--
-- 1. invoices — header table (number, billed_to, dates, VAT, status)
-- 2. invoice_services — line items (service, qty, unit price, desc)
-- 3. finance_entries linking — every invoice creates a revenue row
--    in finance_entries; marking the invoice PAID updates the row,
--    editing/deleting the invoice syncs/deletes the row.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. invoices
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,                  -- CC-INV-2026-0001
  billed_to       text not null,                         -- business / customer name
  billed_address  text not null default '',               -- optional address
  billed_email    text not null default '',
  billed_vat      text not null default '',               -- customer's VAT number
  issue_date      date not null default current_date,
  due_date        date,
  status          text not null default 'draft'           -- draft | sent | paid | void
                    check (status in ('draft','sent','paid','void')),
  vat_included    boolean not null default false,         -- is VAT included in line totals?
  vat_pct         numeric not null default 0,             -- VAT percentage
  currency        text not null default 'EUR',
  notes           text not null default '',               -- optional notes / payment terms
  finance_entry_id uuid references public.finance_entries(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null
);

create index if not exists invoices_number_idx   on public.invoices(number);
create index if not exists invoices_status_idx   on public.invoices(status);
create index if not exists invoices_issue_idx    on public.invoices(issue_date desc);

alter table public.invoices enable row level security;
drop policy if exists "inv_admin_all" on public.invoices;
create policy "inv_admin_all" on public.invoices for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- 2. invoice_services — line items
-- ---------------------------------------------------------------------
create table if not exists public.invoice_services (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  name          text not null,                            -- "Web design" / pick from catalog
  description   text not null default '',                 -- optional per-line description
  quantity      numeric not null default 1,
  unit_price    numeric not null default 0,
  position      int  not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists inv_svc_invoice_idx on public.invoice_services(invoice_id);

alter table public.invoice_services enable row level security;
drop policy if exists "is_admin_all" on public.invoice_services;
create policy "is_admin_all" on public.invoice_services for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

NOTIFY pgrst, 'reload schema';
