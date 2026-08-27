-- =====================================================================
-- Calista Concept — schema68.sql
-- Run AFTER schema67.sql.
--
-- EARNING RULES v2:
--   + credits_per_offer_created  (new offer/opportunity on any lead)
--   'mp_converted' now fires ONLY when a deal tied to a
--   marketplace-sourced lead reaches approved/closed (admin-approved),
--   instead of at offer submission.
-- =====================================================================

alter table public.credit_settings
  add column if not exists credits_per_offer_created numeric not null default 5;

-- Rate getter: include the new key
create or replace function public.credit_rate(p_key text)
returns numeric language sql stable security definer set search_path = public as $$
  select case p_key
    when 'deal_submitted' then credits_per_deal_submitted
    when 'deal_approved'  then credits_per_deal_approved
    when 'offer_created'  then credits_per_offer_created
    when 'lead_created'   then credits_per_lead_created
    when 'mp_converted'   then credits_per_mp_converted
    else 0 end
  from public.credit_settings where id = 1;
$$;

-- Offers: new offer/opportunity created
create or replace function public.tr_credit_offer_create()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.mint_credits(new.owner_id, public.credit_rate('offer_created'), 'offer_created', new.id::text, 'Offer created');
  return new;
end $$;
drop trigger if exists credit_offer_create on public.opportunities;
create trigger credit_offer_create after insert on public.opportunities
  for each row execute function public.tr_credit_offer_create();

-- Marketplace conversion credit moves OUT of opportunity-insert and INTO
-- deal approval: the deal must trace back (via its offer) to a
-- marketplace-sourced company.
drop trigger if exists credit_mp_convert on public.opportunities;

create or replace function public.tr_credit_deal_approve()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mp boolean := false;
begin
  if new.status in ('approved','closed') and coalesce(old.status,'pending_review') not in ('approved','closed') then
    -- Is this deal's offer attached to a marketplace-sourced lead?
    select (c.marketplace_source is not null) into v_mp
    from public.deals d
    left join public.opportunities o on o.id = d.opportunity_id
    left join public.companies c on c.id = o.company_id
    where d.id = new.id;

    if v_mp then
      perform public.mint_credits(new.seller_id, public.credit_rate('mp_converted'), 'mp_converted', new.id::text, 'Marketplace claim approved');
    else
      perform public.mint_credits(new.seller_id, public.credit_rate('deal_approved'), 'deal_approved', new.id::text, 'Deal approved');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists credit_deal_approve on public.deals;
create trigger credit_deal_approve after update on public.deals
  for each row execute function public.tr_credit_deal_approve();

NOTIFY pgrst, 'reload schema';
