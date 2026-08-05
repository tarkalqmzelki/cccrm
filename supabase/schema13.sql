-- =====================================================================
-- Calista Concept — schema13.sql
-- Run AFTER schema.sql through schema12.sql.
--
-- 1. Recreate sync_deal_payout() trigger so it ALWAYS recomputes the
--    payout amount using the seller's CURRENT effective level (not
--    the level at the time of deal creation). This fixes the issue
--    where a seller's level changes but the payout still shows the
--    old rate.
-- 2. The trigger now fires on collected_amount changes too (already
--    did, but now the amount is recalculated correctly).
-- 3. Recompute all existing payouts with correct amounts.
-- =====================================================================

create or replace function public.sync_deal_payout()
returns trigger language plpgsql security definer as $$
declare
  v_seller_revenue numeric := 0;
  v_level          seller_level := 'L1';
  v_commission_pct numeric(5,2) := 10;
  v_settings       public.settings%rowtype;
  v_total_payout   numeric(14,2) := 0;
  v_payout_id      uuid;
  v_new_status     text;
  v_old_status     text;
  v_collected      numeric(14,2) := 0;
  v_referrer_id    uuid;
  v_referrer_level seller_level := 'L1';
  v_referrer_rev   numeric(14,2) := 0;
  v_referral_pct   numeric(5,2) := 5;
  v_referral_amount numeric(14,2) := 0;
  v_ref_payout_id  uuid;
begin
  v_new_status := coalesce(new.status::text, '');
  v_old_status := case when tg_op = 'UPDATE' then coalesce(old.status::text, '') else '' end;
  v_collected  := coalesce(new.collected_amount, 0);

  -- Fire on: INSERT, status change, or collected_amount change
  if tg_op = 'INSERT' or (v_new_status <> v_old_status) or (tg_op = 'UPDATE' and coalesce(new.collected_amount,0) <> coalesce(old.collected_amount,0)) then

    if v_new_status not in ('approved', 'closed') then
      delete from public.payouts where deal_id = new.id;
      return new;
    end if;

    -- Fetch settings
    begin
      select * into v_settings from public.settings where id = 1;
    exception when others then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, 5, 5, 5, now())::public.settings;
    end;
    if v_settings.id is null then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, 5, 5, 5, now())::public.settings;
    end if;

    -- ===== RECOMPUTE SELLER LEVEL FROM CURRENT REVENUE =====
    -- Include THIS deal in the revenue calculation so the level reflects
    -- the current state (e.g. a €20k deal immediately puts seller at L3)
    begin
      select coalesce(sum(gross_value), 0) into v_seller_revenue
        from public.deals
        where seller_id = new.seller_id
          and status in ('closed','approved');
    exception when others then
      v_seller_revenue := 0;
    end;

    -- Determine seller's effective level (INCLUDING this deal)
    if v_seller_revenue >= coalesce(v_settings.l3_threshold, 15000) then
      v_level := 'L3';
    elsif v_seller_revenue >= coalesce(v_settings.l2_threshold, 5000) then
      v_level := 'L2';
    else
      v_level := 'L1';
    end if;

    -- Determine commission: deal override > seller override > level
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

    -- Total expected payout (ALWAYS uses current commission_pct)
    v_total_payout := round(coalesce(new.gross_value, 0) * (v_commission_pct / 100.0), 2);

    -- Also update the deal's commission_pct to reflect current level
    if new.commission_pct <> v_commission_pct then
      new.commission_pct := v_commission_pct;
    end if;

    -- Upsert SELLER payout
    select id into v_payout_id from public.payouts where deal_id = new.id and payout_type = 'sale';
    if v_payout_id is null then
      insert into public.payouts (seller_id, deal_id, amount, paid_amount, status, period, created_at, paid_at, payout_type)
      values (
        new.seller_id, new.id, v_total_payout, 0,
        (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
        to_char(coalesce(new.created_at, now()), 'YYYY-MM'),
        now(),
        case when v_new_status = 'closed' then now() else null end,
        'sale'
      );
    else
      update public.payouts set
        amount = v_total_payout,
        status = (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
        paid_at = case when v_new_status = 'closed' then coalesce(paid_at, now()) else paid_at end,
        period = to_char(coalesce(new.created_at, now()), 'YYYY-MM')
      where id = v_payout_id;
    end if;

    -- ===== REFERRAL PAYOUT =====
    select referrer_id into v_referrer_id
      from public.referrals
      where referee_id = new.seller_id
      limit 1;

    if v_referrer_id is not null then
      -- Determine referrer's level from THEIR revenue
      begin
        select coalesce(sum(gross_value), 0) into v_referrer_rev
          from public.deals
          where seller_id = v_referrer_id
            and status in ('closed','approved');
      exception when others then
        v_referrer_rev := 0;
      end;

      if v_referrer_rev >= coalesce(v_settings.l3_threshold, 15000) then
        v_referrer_level := 'L3';
      elsif v_referrer_rev >= coalesce(v_settings.l2_threshold, 5000) then
        v_referrer_level := 'L2';
      else
        v_referrer_level := 'L1';
      end if;

      v_referral_pct := case v_referrer_level
        when 'L3' then coalesce(v_settings.l3_referral_pct, 5)
        when 'L2' then coalesce(v_settings.l2_referral_pct, 5)
        else coalesce(v_settings.l1_referral_pct, 5)
      end;

      v_referral_amount := round(coalesce(new.gross_value, 0) * (v_referral_pct / 100.0), 2);

      select id into v_ref_payout_id from public.payouts where deal_id = new.id and payout_type = 'referral';
      if v_ref_payout_id is null then
        insert into public.payouts (seller_id, deal_id, amount, paid_amount, status, period, created_at, paid_at, payout_type)
        values (
          v_referrer_id, new.id, v_referral_amount, 0,
          (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
          to_char(coalesce(new.created_at, now()), 'YYYY-MM'),
          now(),
          case when v_new_status = 'closed' then now() else null end,
          'referral'
        );
      else
        update public.payouts set
          amount = v_referral_amount,
          status = (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
          paid_at = case when v_new_status = 'closed' then coalesce(paid_at, now()) else paid_at end,
          period = to_char(coalesce(new.created_at, now()), 'YYYY-MM')
        where id = v_ref_payout_id;
      end if;
    else
      delete from public.payouts where deal_id = new.id and payout_type = 'referral';
    end if;
  end if;

  return new;
end $$;

-- =====================================================================
-- Recompute all existing payouts with correct amounts
-- =====================================================================
do $$
declare
  r record;
  v_settings public.settings%rowtype;
  v_revenue numeric;
  v_level seller_level;
  v_pct numeric(5,2);
  v_amount numeric(14,2);
  v_ref_pct numeric(5,2);
  v_ref_amount numeric(14,2);
  v_referrer_id uuid;
  v_ref_rev numeric;
  v_ref_level seller_level;
begin
  select * into v_settings from public.settings where id = 1;
  if not found then
    v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, 5, 5, 5, now())::public.settings;
  end if;

  for r in select * from public.deals where status in ('approved','closed') loop
    -- seller revenue
    select coalesce(sum(gross_value),0) into v_revenue
      from public.deals where seller_id = r.seller_id and status in ('closed','approved');

    if v_revenue >= coalesce(v_settings.l3_threshold,15000) then v_level := 'L3';
    elsif v_revenue >= coalesce(v_settings.l2_threshold,5000) then v_level := 'L2';
    else v_level := 'L1'; end if;

    -- commission
    if r.custom_commission_pct is not null then v_pct := r.custom_commission_pct;
    else
      select custom_commission_pct into v_pct from public.profiles where id = r.seller_id;
      if v_pct is null then
        v_pct := case v_level when 'L3' then v_settings.l3_commission_pct when 'L2' then v_settings.l2_commission_pct else v_settings.l1_commission_pct end;
      end if;
    end if;

    v_amount := round(r.gross_value * (v_pct / 100.0), 2);

    -- update deal commission_pct
    update public.deals set commission_pct = v_pct where id = r.id;

    -- update sale payout
    update public.payouts set amount = v_amount where deal_id = r.id and payout_type = 'sale';

    -- referral payout
    select referrer_id into v_referrer_id from public.referrals where referee_id = r.seller_id limit 1;
    if v_referrer_id is not null then
      select coalesce(sum(gross_value),0) into v_ref_rev
        from public.deals where seller_id = v_referrer_id and status in ('closed','approved');
      if v_ref_rev >= coalesce(v_settings.l3_threshold,15000) then v_ref_level := 'L3';
      elsif v_ref_rev >= coalesce(v_settings.l2_threshold,5000) then v_ref_level := 'L2';
      else v_ref_level := 'L1'; end if;

      v_ref_pct := case v_ref_level when 'L3' then v_settings.l3_referral_pct when 'L2' then v_settings.l2_referral_pct else v_settings.l1_referral_pct end;
      v_ref_amount := round(r.gross_value * (v_ref_pct / 100.0), 2);
      update public.payouts set amount = v_ref_amount where deal_id = r.id and payout_type = 'referral';
    end if;
  end loop;
end $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. Payouts now always reflect the seller's CURRENT level.
-- =====================================================================
