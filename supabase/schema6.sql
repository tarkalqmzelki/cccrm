-- =====================================================================
-- Calista Concept — schema6.sql
-- Run AFTER schema.sql through schema5.sql.
--
-- Adds partial payment tracking:
--   deals.collected_amount   — how much the company has received from the client
--   payouts.paid_amount      — how much has been disbursed to the seller
--
-- The seller's collectable payout = collected_amount * commission_pct / 100
-- The seller sees: paid_amount / collectable_amount / total_amount
-- =====================================================================

-- ---------- DEAL COLUMNS ----------
alter table public.deals
  add column if not exists collected_amount numeric(14,2) not null default 0;

-- ---------- PAYOUT COLUMNS ----------
alter table public.payouts
  add column if not exists paid_amount numeric(14,2) not null default 0;

-- =====================================================================
-- UPDATED TRIGGER: sync_deal_payout()
-- Now also computes collectable_amount from deals.collected_amount
-- and preserves paid_amount across status changes.
-- =====================================================================
create or replace function public.sync_deal_payout()
returns trigger language plpgsql security definer as $$
declare
  v_seller_revenue numeric := 0;
  v_level          seller_level := 'L1';
  v_commission_pct numeric(5,2) := 10;
  v_settings       public.settings%rowtype;
  v_total_payout   numeric(14,2) := 0;
  v_collectable    numeric(14,2) := 0;
  v_payout_id      uuid;
  v_new_status     text;
  v_old_status     text;
  v_existing_paid  numeric(14,2) := 0;
  v_collected      numeric(14,2) := 0;
begin
  v_new_status := coalesce(new.status::text, '');
  v_old_status := case when tg_op = 'UPDATE' then coalesce(old.status::text, '') else '' end;
  v_collected  := coalesce(new.collected_amount, 0);

  if tg_op = 'INSERT' or (v_new_status <> v_old_status) or (tg_op = 'UPDATE' and coalesce(new.collected_amount,0) <> coalesce(old.collected_amount,0)) then

    if v_new_status not in ('approved', 'closed') then
      delete from public.payouts where deal_id = new.id;
      return new;
    end if;

    -- Fetch settings
    begin
      select * into v_settings from public.settings where id = 1;
    exception when others then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, now())::public.settings;
    end;
    if v_settings.id is null then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, now())::public.settings;
    end if;

    -- Compute seller revenue (excluding this deal)
    begin
      select coalesce(sum(gross_value), 0) into v_seller_revenue
        from public.deals
        where seller_id = new.seller_id
          and status in ('closed','approved')
          and id <> new.id;
    exception when others then
      v_seller_revenue := 0;
    end;

    -- Determine effective level
    if v_seller_revenue + coalesce(new.gross_value, 0) >= coalesce(v_settings.l3_threshold, 15000) then
      v_level := 'L3';
    elsif v_seller_revenue + coalesce(new.gross_value, 0) >= coalesce(v_settings.l2_threshold, 5000) then
      v_level := 'L2';
    else
      v_level := 'L1';
    end if;

    -- Determine commission
    if new.custom_commission_pct is not null then
      v_commission_pct := new.custom_commission_pct;
    else
      begin
        select custom_commission_pct into v_commission_pct from public.profiles where id = new.seller_id;
      exception when others then
        v_commission_pct := null;
      end;
      if v_commission_pct is null then
        v_commission_pct := case v_level
          when 'L3' then coalesce(v_settings.l3_commission_pct, 20)
          when 'L2' then coalesce(v_settings.l2_commission_pct, 15)
          else coalesce(v_settings.l1_commission_pct, 10)
        end;
      end if;
    end if;

    -- Total expected payout
    v_total_payout := round(coalesce(new.gross_value, 0) * (v_commission_pct / 100.0), 2);

    -- Collectable = portion the seller can claim based on what we've collected
    v_collectable := round(v_collected * (v_commission_pct / 100.0), 2);
    -- Never exceed total
    if v_collectable > v_total_payout then
      v_collectable := v_total_payout;
    end if;

    -- Check for existing payout (preserve paid_amount)
    select id, coalesce(paid_amount, 0) into v_payout_id, v_existing_paid
      from public.payouts where deal_id = new.id;

    if v_payout_id is null then
      insert into public.payouts (seller_id, deal_id, amount, paid_amount, status, period, created_at, paid_at)
      values (
        new.seller_id, new.id, v_total_payout, 0,
        (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
        to_char(coalesce(new.created_at, now()), 'YYYY-MM'),
        now(),
        case when v_new_status = 'closed' then now() else null end
      );
    else
      update public.payouts set
        amount = v_total_payout,
        status = (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
        paid_at = case when v_new_status = 'closed' then coalesce(paid_at, now()) else paid_at end,
        period = to_char(coalesce(new.created_at, now()), 'YYYY-MM')
      where id = v_payout_id;
    end if;
  end if;

  return new;
end $$;

-- =====================================================================
-- DONE. Admin can now set collected_amount on deals, and mark payouts
-- as partially or fully paid to the seller.
-- =====================================================================
