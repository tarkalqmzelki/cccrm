-- =====================================================================
-- Calista Concept — schema8.sql
-- Run AFTER schema.sql through schema7.sql.
--
-- 1. Separate referral commission per level (independent from sales commission)
-- 2. Add payout_type column ('sale' | 'referral')
-- 3. Trigger creates BOTH seller payout AND referrer payout on deal approval
-- 4. Fix deal deletion (add DELETE RLS policy — was missing!)
-- =====================================================================

-- ---------- SETTINGS: per-level referral commission ----------
alter table public.settings
  add column if not exists l1_referral_pct numeric(5,2) not null default 5,
  add column if not exists l2_referral_pct numeric(5,2) not null default 5,
  add column if not exists l3_referral_pct numeric(5,2) not null default 5;

-- Migrate old single referral_commission_pct if present
update public.settings
  set l1_referral_pct = coalesce(referral_commission_pct, 5),
      l2_referral_pct = coalesce(referral_commission_pct, 5),
      l3_referral_pct = coalesce(referral_commission_pct, 5)
where id = 1;

-- ---------- PAYOUTS: payout_type ----------
alter table public.payouts
  add column if not exists payout_type text not null default 'sale';

-- backfill existing payouts
update public.payouts set payout_type = 'sale' where payout_type is null or payout_type = '';

-- =====================================================================
-- FIX: Add DELETE RLS policy for deals (was missing — deals couldn't be deleted)
-- =====================================================================
drop policy if exists "deals_admin_delete" on public.deals;
create policy "deals_admin_delete" on public.deals for delete
  using (public.is_admin());

drop policy if exists "deals_seller_delete" on public.deals;
create policy "deals_seller_delete" on public.deals for delete
  using (seller_id = auth.uid());

-- Also fix payouts deletion (so trigger can clean up)
drop policy if exists "payouts_admin_delete" on public.payouts;
create policy "payouts_admin_delete" on public.payouts for delete
  using (public.is_admin());

-- =====================================================================
-- UPDATED TRIGGER: creates seller payout AND referrer payout
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
  v_collected      numeric(14,2) := 0;

  -- referral vars
  v_referrer_id    uuid;
  v_referrer_level seller_level := 'L1';
  v_referrer_rev   numeric(14,2) := 0;
  v_referral_pct   numeric(5,2) := 5;
  v_referral_amount numeric(14,2) := 0;
  v_referral_collectable numeric(14,2) := 0;
  v_ref_payout_id  uuid;
begin
  v_new_status := coalesce(new.status::text, '');
  v_old_status := case when tg_op = 'UPDATE' then coalesce(old.status::text, '') else '' end;
  v_collected  := coalesce(new.collected_amount, 0);

  if tg_op = 'INSERT' or (v_new_status <> v_old_status) or (tg_op = 'UPDATE' and coalesce(new.collected_amount,0) <> coalesce(old.collected_amount,0)) then

    -- If status is not qualifying, remove ALL payouts for this deal (sale + referral)
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

    -- Determine seller's effective level
    if v_seller_revenue + coalesce(new.gross_value, 0) >= coalesce(v_settings.l3_threshold, 15000) then
      v_level := 'L3';
    elsif v_seller_revenue + coalesce(new.gross_value, 0) >= coalesce(v_settings.l2_threshold, 5000) then
      v_level := 'L2';
    else
      v_level := 'L1';
    end if;

    -- Determine seller's commission
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

    -- Total expected payout for seller
    v_total_payout := round(coalesce(new.gross_value, 0) * (v_commission_pct / 100.0), 2);
    v_collectable := round(v_collected * (v_commission_pct / 100.0), 2);
    if v_collectable > v_total_payout then v_collectable := v_total_payout; end if;

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
    -- Find the direct referrer of this deal's seller (one-leg rule)
    select referrer_id into v_referrer_id
      from public.referrals
      where referee_id = new.seller_id
      limit 1;

    if v_referrer_id is not null then
      -- Determine referrer's level (based on referrer's own revenue)
      begin
        select coalesce(sum(gross_value), 0) into v_referrer_rev
          from public.deals d
          join public.payouts p on p.deal_id = d.id
          where p.seller_id = v_referrer_id and p.payout_type = 'sale'
            and d.status in ('closed','approved');
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

      -- Referral commission rate is SEPARATE from sales commission, per level
      v_referral_pct := case v_referrer_level
        when 'L3' then coalesce(v_settings.l3_referral_pct, 5)
        when 'L2' then coalesce(v_settings.l2_referral_pct, 5)
        else coalesce(v_settings.l1_referral_pct, 5)
      end;

      v_referral_amount := round(coalesce(new.gross_value, 0) * (v_referral_pct / 100.0), 2);
      v_referral_collectable := round(v_collected * (v_referral_pct / 100.0), 2);
      if v_referral_collectable > v_referral_amount then v_referral_collectable := v_referral_amount; end if;

      -- Upsert REFERRAL payout
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
      -- No referrer — remove any stale referral payout
      delete from public.payouts where deal_id = new.id and payout_type = 'referral';
    end if;
  end if;

  return new;
end $$;

-- Also clean up referral payouts when a deal is deleted
drop trigger if exists trg_cleanup_payouts_on_delete on public.deals;
create or replace function public.cleanup_payouts_on_delete()
returns trigger language plpgsql security definer as $$
begin
  delete from public.payouts where deal_id = old.id;
  return old;
end $$;

create trigger trg_cleanup_payouts_on_delete
  before delete on public.deals
  for each row execute function public.cleanup_payouts_on_delete();

-- =====================================================================
-- DONE.
-- - Referral commission is now separate per level (L1/L2/L3)
-- - Referral payouts are created alongside seller payouts
-- - Deal deletion now works (RLS + trigger cleanup)
-- =====================================================================
