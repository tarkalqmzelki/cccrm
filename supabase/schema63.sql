-- =====================================================================
-- Calista Concept — schema63.sql
-- Run AFTER schema62.sql.
--
-- BANK — admin-issued virtual cards for members.
--   bank_cards        fully manual card details, per-user, freezable
--   bank_transactions admin-recorded top-ups & categorized spends;
--                     balance = initial_balance + Σtopups − Σspends
-- =====================================================================

create table if not exists public.bank_cards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  holder_name      text not null default '',
  card_number      text not null default '',
  expiry           text not null default '',
  cvv              text not null default '',
  brand            text not null default 'visa',
  gradient         text not null default 'aurora',
  initial_balance  numeric not null default 0,
  frozen           boolean not null default false,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists bc_user_idx on public.bank_cards(user_id);

create table if not exists public.bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.bank_cards(id) on delete cascade,
  kind          text not null check (kind in ('topup', 'spend')),
  category      text not null default 'other',
  amount        numeric not null check (amount > 0),
  note          text not null default '',
  occurred_at   timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists bt_card_idx on public.bank_transactions(card_id);
create index if not exists bt_time_idx on public.bank_transactions(occurred_at);

alter table public.bank_cards enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists "bc_read" on public.bank_cards;
drop policy if exists "bc_write" on public.bank_cards;
create policy "bc_read" on public.bank_cards for select using (true);
create policy "bc_write" on public.bank_cards for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "bt_read" on public.bank_transactions;
drop policy if exists "bt_write" on public.bank_transactions;
create policy "bt_read" on public.bank_transactions for select using (true);
create policy "bt_write" on public.bank_transactions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

NOTIFY pgrst, 'reload schema';
