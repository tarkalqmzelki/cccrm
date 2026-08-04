-- =====================================================================
-- Calista Concept — schema4.sql  (fixed)
-- Run AFTER schema.sql + schema2.sql + schema3.sql.
--
-- 1. Fixes the sync_deal_payout() trigger that used coalesce(new.status,'')
--    which cast '' to the deal_status enum and failed on every insert.
-- 2. Cleans up any deals with invalid/empty status values.
-- =====================================================================

-- =====================================================================
-- 1. FIX THE TRIGGER FUNCTION
--    Use coalesce(new.status::text, '') instead of coalesce(new.status, '')
--    so Postgres doesn't try to cast '' to the enum type.
-- =====================================================================
create or replace function public.sync_deal_payout()
returns trigger language plpgsql security definer as $$
declare
  v_seller_revenue numeric;
  v_level          seller_level;
  v_commission_pct numeric(5,2);
  v_settings       public.settings%rowtype;
  v_amount         numeric(14,2);
  v_payout_id      uuid;
begin
  -- only act on status changes (compare as text to avoid enum cast issues)
  if (tg_op = 'INSERT' or (tg_op = 'UPDATE' and coalesce(new.status::text,'') <> coalesce(old.status::text,''))) then
    -- remove existing payout if status no longer qualifies
    if new.status not in ('approved', 'closed') then
      delete from public.payouts where deal_id = new.id;
      return new;
    end if;

    -- fetch settings
    select * into v_settings from public.settings where id = 1;
    if not found then
      v_settings := row(1, 0, 5000, 15000, 10, 15, 20, 5, now())::public.settings;
    end if;

    -- compute seller's effective commission
    select sum(gross_value) into v_seller_revenue
      from public.deals
      where seller_id = new.seller_id
        and status in ('closed','approved')
        and id <> new.id;

    if v_seller_revenue + new.gross_value >= v_settings.l3_threshold then
      v_level := 'L3';
    elsif v_seller_revenue + new.gross_value >= v_settings.l2_threshold then
      v_level := 'L2';
    else
      v_level := 'L1';
    end if;

    -- custom deal override > seller override > level
    if new.custom_commission_pct is not null then
      v_commission_pct := new.custom_commission_pct;
    else
      select custom_commission_pct into v_commission_pct from public.profiles where id = new.seller_id;
      if v_commission_pct is null then
        v_commission_pct := case v_level
          when 'L3' then v_settings.l3_commission_pct
          when 'L2' then v_settings.l2_commission_pct
          else v_settings.l1_commission_pct
        end;
      end if;
    end if;

    v_amount := round(new.gross_value * (v_commission_pct / 100.0), 2);

    -- upsert payout
    select id into v_payout_id from public.payouts where deal_id = new.id;
    if v_payout_id is null then
      insert into public.payouts (seller_id, deal_id, amount, status, period, created_at, paid_at)
      values (new.seller_id, new.id, v_amount,
              case when new.status = 'closed' then 'paid' else 'pending' end,
              to_char(new.created_at, 'YYYY-MM'),
              now(),
              case when new.status = 'closed' then now() else null end);
    else
      update public.payouts set
        amount = v_amount,
        status = case when new.status = 'closed' then 'paid' else 'pending' end,
        paid_at = case when new.status = 'closed' then coalesce(paid_at, now()) else null end,
        period = to_char(new.created_at, 'YYYY-MM')
      where id = v_payout_id;
    end if;
  end if;

  return new;
end $$;

-- =====================================================================
-- 2. CLEAN UP BAD ROWS
-- =====================================================================
delete from public.deals
where status::text is null
   or status::text = ''
   or status::text not in (
     'cold_call', 'warm_call', 'unfinished', 'to_be_finished',
     'pending_review', 'approved', 'rejected', 'closed'
   );

delete from public.payouts
where deal_id is not null
  and deal_id not in (select id from public.deals);

-- =====================================================================
-- DONE. Deal inserts will now work.
-- =====================================================================
