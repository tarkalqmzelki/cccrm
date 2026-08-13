-- =====================================================================
-- Calista Concept — schema25.sql
-- Run AFTER schema.sql through schema24.sql.
--
-- Platform finances for admins: revenue (closed deals + manual admin
-- entries e.g. product sales) and costs (materials, utilities, office,
-- etc.). Periods are derived from entry dates — printable balance
-- sheets are produced client-side.
-- =====================================================================

do $$ begin
  create type public.finance_kind as enum ('revenue', 'cost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.finance_category as enum (
    -- revenue categories
    'product_sale', 'service_sale', 'closed_deal_commission', 'other_revenue',
    -- cost categories
    'materials', 'utility_bill', 'office', 'salary', 'marketing', 'software', 'taxes', 'other_cost'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.finance_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        public.finance_kind not null,
  category    public.finance_category not null,
  title       text not null default '',
  description text not null default '',
  amount      numeric(12,2) not null default 0,
  entry_date  date not null default now()::date,
  -- Optional link to a closed deal for闭合-deal commission revenue
  deal_id     uuid references public.deals(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists finance_kind_idx   on public.finance_entries(kind);
create index if not exists finance_date_idx   on public.finance_entries(entry_date desc);
create index if not exists finance_cat_idx    on public.finance_entries(category);

alter table public.finance_entries enable row level security;

drop policy if exists "fin_read"   on public.finance_entries;
drop policy if exists "fin_insert" on public.finance_entries;
drop policy if exists "fin_update" on public.finance_entries;
drop policy if exists "fin_delete" on public.finance_entries;

-- Only admins can manage finances; nobody else sees them
create policy "fin_read"   on public.finance_entries for select
  using (public.is_admin());
create policy "fin_insert" on public.finance_entries for insert
  with check (public.is_admin());
create policy "fin_update" on public.finance_entries for update
  using (public.is_admin()) with check (public.is_admin());
create policy "fin_delete" on public.finance_entries for delete
  using (public.is_admin());

-- auto-set created_by on insert
create or replace function public.set_finance_creator()
returns trigger language plpgsql security definer as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_finance_creator on public.finance_entries;
create trigger trg_finance_creator
  before insert on public.finance_entries
  for each row execute function public.set_finance_creator();

-- touch updated_at on update
drop trigger if exists trg_finance_touch on public.finance_entries;
create trigger trg_finance_touch
  before update on public.finance_entries
  for each row execute function public.touch_updated_at();

NOTIFY pgrst, 'reload schema';