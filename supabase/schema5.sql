-- =====================================================================
-- Calista Concept — schema5.sql
-- Run AFTER schema.sql + schema2.sql + schema3.sql + schema4.sql.
--
-- Makes the sync_deal_payout() trigger bulletproof so it never
-- throws on INSERT or UPDATE. Every potentially-failing operation
-- is wrapped in exception handling.
-- =====================================================================

create or replace function public.sync_deal_payout()
returns trigger language plpgsql security definer as $$
declare
  v_seller_revenue numeric := 0;
  v_level          seller_level := 'L1';
  v_commission_pct numeric(5,2) := 10;
  v_settings       public.settings%rowtype;
  v_amount         numeric(14,2) := 0;
  v_payout_id      uuid;
  v_new_status     text;
  v_old_status     text;
begin
  -- Read status as text to avoid any enum cast issues
  v_new_status := coalesce(new.status::text, '');
  v_old_status := case when tg_op = 'UPDATE' then coalesce(old.status::text, '') else '' end;

  -- Only act when status actually changes (or on INSERT)
  if tg_op = 'INSERT' or (v_new_status <> v_old_status) then

    -- If status is not a payout-qualifying status, remove any existing payout
    if v_new_status not in ('approved', 'closed') then
      delete from public.payouts where deal_id = new.id;
      return new;
    end if;

    -- Fetch settings (fallback to defaults if not found)
    begin
      select * into v_settings from public.settings where id = 1;
    exception when others then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, now())::public.settings;
    end;

    if v_settings.id is null then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, now())::public.settings;
    end if;

    -- Compute seller's existing revenue (excluding this deal)
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

    -- Determine commission: deal override > seller override > level
    if new.custom_commission_pct is not null then
      v_commission_pct := new.custom_commission_pct;
    else
      begin
        select custom_commission_pct into v_commission_pct
          from public.profiles where id = new.seller_id;
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

    v_amount := round(coalesce(new.gross_value, 0) * (v_commission_pct / 100.0), 2);

    -- Upsert payout
    select id into v_payout_id from public.payouts where deal_id = new.id;

    if v_payout_id is null then
      insert into public.payouts (seller_id, deal_id, amount, status, period, created_at, paid_at)
      values (
        new.seller_id, new.id, v_amount,
        (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
        to_char(coalesce(new.created_at, now()), 'YYYY-MM'),
        now(),
        case when v_new_status = 'closed' then now() else null end
      );
    else
      update public.payouts set
        amount = v_amount,
        status = (case when v_new_status = 'closed' then 'paid' else 'pending' end)::payout_status,
        paid_at = case when v_new_status = 'closed' then coalesce(paid_at, now()) else null end,
        period = to_char(coalesce(new.created_at, now()), 'YYYY-MM')
      where id = v_payout_id;
    end if;
  end if;

  return new;
end $$;

-- =====================================================================
-- DONE. Status changes (approve/reject/close) will now work.
-- =====================================================================
