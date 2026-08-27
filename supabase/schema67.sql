-- =====================================================================
-- Calista Concept — schema67.sql
-- Run AFTER schema66.sql.
--
-- TOKENIZATION — CC Credits
--   credit_settings   singleton: earning rates
--   credit_ledger     append-only balance events (balance = Σ delta)
--   redeem_items      admin-curated shop (voucher-code based)
--   redemptions       purchase records + revealed voucher codes
--   companies.marketplace_source  links claimed leads → MP conversion
--
-- AUTO-MINTING happens in DB triggers so balances can't be faked:
--   deals insert            → deal_submitted
--   deals → approved/closed → deal_approved
--   companies insert        → lead_created
--   opportunities insert on a marketplace-sourced company
--                           → mp_converted
--   challenge_progress completed_at set → challenge points × rate
-- =====================================================================

alter table public.companies
  add column if not exists marketplace_source uuid;

-- ---------------------------------------------------------------------
-- Settings singleton
-- ---------------------------------------------------------------------
create table if not exists public.credit_settings (
  id                          int primary key default 1,
  credits_per_deal_submitted  numeric not null default 10,
  credits_per_deal_approved   numeric not null default 25,
  credits_per_lead_created    numeric not null default 5,
  credits_per_mp_converted    numeric not null default 40,
  challenge_points_rate       numeric not null default 1,
  updated_at                  timestamptz not null default now()
);
insert into public.credit_settings (id) values (1) on conflict (id) do nothing;

alter table public.credit_settings enable row level security;
drop policy if exists "cs_read" on public.credit_settings;
drop policy if exists "cs_write" on public.credit_settings;
create policy "cs_read" on public.credit_settings for select using (true);
create policy "cs_write" on public.credit_settings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  delta       numeric not null,
  reason      text not null,
  note        text not null default '',
  ref_id      text,
  created_at  timestamptz not null default now()
);
create index if not exists cl_user_idx on public.credit_ledger(user_id);
create unique index if not exists credit_dedupe_idx
  on public.credit_ledger(reason, ref_id) where ref_id is not null;

alter table public.credit_ledger enable row level security;
drop policy if exists "cl_read" on public.credit_ledger;
create policy "cl_read" on public.credit_ledger for select using (true);

-- ---------------------------------------------------------------------
-- Shop + redemptions
-- ---------------------------------------------------------------------
create table if not exists public.redeem_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  image_url    text not null default '',
  cost         numeric not null default 0,
  stock        int not null default -1,      -- -1 = unlimited
  featured     boolean not null default false,
  active       boolean not null default true,
  codes        text not null default '',     -- one voucher code per line
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.redemptions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references public.redeem_items(id) on delete set null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  item_title    text not null default '',
  cost          numeric not null default 0,
  code          text not null default '',
  status        text not null default 'pending' check (status in ('pending','delivered')),
  delivered_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists rd_user_idx on public.redemptions(user_id);

alter table public.redeem_items enable row level security;
drop policy if exists "ri_read" on public.redeem_items;
drop policy if exists "ri_write" on public.redeem_items;
create policy "ri_read" on public.redeem_items for select using (true);
create policy "ri_write" on public.redeem_items for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table public.redemptions enable row level security;
drop policy if exists "rd_read" on public.redemptions;
drop policy if exists "rd_insert" on public.redemptions;
drop policy if exists "rd_admin" on public.redemptions;
create policy "rd_read" on public.redemptions for select using (true);
create policy "rd_insert" on public.redemptions for insert
  with check (user_id = auth.uid());
create policy "rd_admin" on public.redemptions for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (true);

-- ---------------------------------------------------------------------
-- Credit helper: balance for a user
-- ---------------------------------------------------------------------
create or replace function public.credit_balance(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0) from public.credit_ledger where user_id = p_user;
$$;

-- Mint helper: dedupe-safe insert
create or replace function public.mint_credits(
  p_user uuid, p_delta numeric, p_reason text, p_ref text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_delta is null or p_delta <= 0 then return; end if;
  begin
    insert into public.credit_ledger (user_id, delta, reason, ref_id, note)
    values (p_user, p_delta, p_reason, p_ref, p_note);
  exception when unique_violation then
    null; -- already minted for this ref
  end;
end;
$$;

-- Rate getter
create or replace function public.credit_rate(p_key text)
returns numeric language sql stable security definer set search_path = public as $$
  select case p_key
    when 'deal_submitted' then credits_per_deal_submitted
    when 'deal_approved'  then credits_per_deal_approved
    when 'lead_created'   then credits_per_lead_created
    when 'mp_converted'   then credits_per_mp_converted
    else 0 end
  from public.credit_settings where id = 1;
$$;

-- ---------------------------------------------------------------------
-- AUTO-MINT TRIGGERS
-- ---------------------------------------------------------------------

-- Deals: submission (insert)
create or replace function public.tr_credit_deal_submit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.mint_credits(new.seller_id, public.credit_rate('deal_submitted'), 'deal_submitted', new.id::text, 'Deal submitted');
  return new;
end $$;
drop trigger if exists credit_deal_submit on public.deals;
create trigger credit_deal_submit after insert on public.deals
  for each row execute function public.tr_credit_deal_submit();

-- Deals: approval / close (from pending_review or rejected→approved path)
create or replace function public.tr_credit_deal_approve()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved','closed') and coalesce(old.status,'pending_review') not in ('approved','closed') then
    perform public.mint_credits(new.seller_id, public.credit_rate('deal_approved'), 'deal_approved', new.id::text, 'Deal approved');
  end if;
  return new;
end $$;
drop trigger if exists credit_deal_approve on public.deals;
create trigger credit_deal_approve after update on public.deals
  for each row execute function public.tr_credit_deal_approve();

-- Companies: lead created
create or replace function public.tr_credit_lead_create()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    perform public.mint_credits(new.created_by, public.credit_rate('lead_created'), 'lead_created', new.id::text, 'Lead created');
  end if;
  return new;
end $$;
drop trigger if exists credit_lead_create on public.companies;
create trigger credit_lead_create after insert on public.companies
  for each row execute function public.tr_credit_lead_create();

-- Opportunities: conversion of a marketplace-sourced lead
create or replace function public.tr_credit_mp_convert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  select created_by into v_creator from public.companies where id = new.company_id;
  if v_creator is not null and new.owner_id = v_creator then
    perform public.mint_credits(v_creator, public.credit_rate('mp_converted'), 'mp_converted', new.company_id::text, 'Marketplace lead converted');
  end if;
  return new;
end $$;
drop trigger if exists credit_mp_convert on public.opportunities;
create trigger credit_mp_convert after insert on public.opportunities
  for each row execute function public.tr_credit_mp_convert();

-- Challenges: points × rate on completion
create or replace function public.tr_credit_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_points int; v_rate numeric;
begin
  if new.completed_at is not null and coalesce(old.completed_at is null, true) then
    select points into v_points from public.challenges where id = new.challenge_id;
    select challenge_points_rate into v_rate from public.credit_settings where id = 1;
    perform public.mint_credits(new.user_id, coalesce(v_points,0) * coalesce(v_rate,1), 'challenge', new.id::text, 'Challenge completed');
  end if;
  return new;
end $$;
drop trigger if exists credit_challenge on public.challenge_progress;
create trigger credit_challenge after insert or update on public.challenge_progress
  for each row execute function public.tr_credit_challenge();

-- ---------------------------------------------------------------------
-- REDEEM — atomic voucher purchase (client calls this RPC)
-- ---------------------------------------------------------------------
create or replace function public.redeem_voucher(p_item uuid)
returns text -- the voucher code
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_cost numeric; v_codes text; v_stock int; v_active boolean; v_title text;
  v_code text; v_rest text; v_rd uuid; v_balance numeric;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select cost, codes, stock, active, title
    into v_cost, v_codes, v_stock, v_active, v_title
  from public.redeem_items where id = p_item for update;

  if not found or not v_active then raise exception 'ITEM_UNAVAILABLE'; end if;
  if v_stock = 0 then raise exception 'SOLD_OUT'; end if;

  -- pick first non-empty code
  v_code := null; v_rest := '';
  declare
    ln text;
    parts text[] := string_to_array(coalesce(v_codes,''), chr(10));
    i int := 0;
    taken bool := false;
  begin
    foreach ln in array parts loop
      i := i + 1;
      if not taken and btrim(ln) <> '' then
        v_code := btrim(ln); taken := true;
      elsif taken or btrim(ln) = '' then
        v_rest := v_rest || (case when v_rest = '' then '' else chr(10) end) || ln;
      end if;
    end loop;
  end;

  if v_code is null then raise exception 'SOLD_OUT'; end if;

  v_balance := public.credit_balance(v_user);
  if v_balance < v_cost then raise exception 'INSUFFICIENT_FUNDS'; end if;

  -- write redemption + deduct
  update public.redeem_items set codes = v_rest,
    stock = case when v_stock > 0 then v_stock - 1 else v_stock end,
    updated_at = now() where id = p_item;

  insert into public.redemptions (item_id, user_id, item_title, cost, code)
  values (p_item, v_user, v_title, v_cost, v_code)
  returning id into v_rd;

  insert into public.credit_ledger (user_id, delta, reason, ref_id, note)
  values (v_user, -v_cost, 'redeem', v_rd::text, 'Redeemed: ' || v_title);

  return v_code;
end $$;

revoke all on function public.redeem_voucher(uuid) from public;
grant execute on function public.redeem_voucher(uuid) to authenticated;

-- Points → credits conversion (from a bank card into the global balance)
create or replace function public.convert_points(p_card uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_bal numeric;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;

  select coalesce(initial_balance,0)
    + coalesce((select sum(case when kind='topup' then amount else -amount end)
                from public.bank_transactions where card_id = p_card), 0)
  into v_bal
  from public.bank_cards where id = p_card and user_id = v_user;

  if not found then raise exception 'CARD_NOT_FOUND'; end if;
  if v_bal < p_amount then raise exception 'INSUFFICIENT_POINTS'; end if;

  insert into public.bank_transactions (card_id, kind, category, amount, note, occurred_at)
  values (p_card, 'spend', 'other', p_amount, 'Converted to CC Credits', now());

  insert into public.credit_ledger (user_id, delta, reason, ref_id, note)
  values (v_user, p_amount, 'conversion', gen_random_uuid()::text, 'Converted points');

  return public.credit_balance(v_user);
end $$;

revoke all on function public.convert_points(uuid, numeric) from public;
grant execute on function public.convert_points(uuid, numeric) to authenticated;

NOTIFY pgrst, 'reload schema';
