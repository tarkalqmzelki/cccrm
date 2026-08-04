-- =====================================================================
-- Calista Concept — schema3.sql
-- Run AFTER schema.sql + schema2.sql.
--
-- This script:
--   1. Adds a create_user() RPC function (admin creates auth users
--      with email + password + role + level from the app).
--   2. Adds an update_user_password() RPC function (admin resets any
--      user's password).
--   3. Adds a sync_deal_payout() trigger function that auto-creates
--      the seller's payout when a deal is approved/closed, using the
--      correct commission from the seller's effective level.
--   4. Cleans ALL seeded data (keeps only the admin user + profile).
-- =====================================================================

-- pgcrypto for bcrypt
create extension if not exists pgcrypto;

-- =====================================================================
-- 1. CREATE USER  (admin calls this from the app)
-- =====================================================================
-- Creates a new auth user WITH a password and upserts their profile.
-- Only callable by admins (RLS on the function via security definer
-- + explicit check).
create or replace function public.create_user(
  p_email    text,
  p_password text,
  p_full_name text default '',
  p_role     text default 'seller',
  p_level    text default 'L1',
  p_phone    text default ''
) returns uuid
language plpgsql security definer as $$
declare
  v_id   uuid;
begin
  -- enforce admin-only
  if not public.is_admin() then
    raise exception 'Only admins can create users';
  end if;

  -- create the auth user
  v_id := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone
  )
  values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', lower(p_email),
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', ''
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    updated_at = now();

  -- identities (some Supabase versions need this)
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email)),
    'email', lower(p_email), now(), now(), now()
  )
  on conflict (provider, provider_id) do update
    set identity_data = excluded.identity_data, updated_at = now();

  -- upsert profile
  insert into public.profiles (id, email, full_name, role, level, phone, active)
  values (v_id, lower(p_email), p_full_name, p_role::user_role, p_level::seller_level, p_phone, true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    level = excluded.level,
    phone = excluded.phone,
    updated_at = now();

  return v_id;
end $$;

-- =====================================================================
-- 2. UPDATE USER PASSWORD  (admin resets any user's password)
-- =====================================================================
create or replace function public.update_user_password(
  p_user_id  uuid,
  p_password text
) returns void
language plpgsql security definer as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset passwords';
  end if;
  if length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  update auth.users
    set encrypted_password = crypt(p_password, gen_salt('bf')),
        updated_at = now()
    where id = p_user_id;
end $$;

-- =====================================================================
-- 3. SYNC DEAL PAYOUT  (trigger on deals table)
-- =====================================================================
-- When a deal becomes 'approved' or 'closed', create/update the
-- seller's payout row using the deal's commission_pct (which is set
-- by the app based on the seller's effective level or custom override).
-- When a deal is rejected/cold/etc, remove the payout.
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
  -- only act on status changes
  if (tg_op = 'INSERT' or (tg_op = 'UPDATE' and coalesce(new.status,'') <> coalesce(old.status,''))) then
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
    select * into v_settings from public.settings where id = 1;
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

drop trigger if exists trg_sync_deal_payout on public.deals;
create trigger trg_sync_deal_payout
  after insert or update on public.deals
  for each row execute function public.sync_deal_payout();

-- =====================================================================
-- 4. CLEAN SEEDED DATA  (keep ONLY the admin)
-- =====================================================================
-- Delete all non-admin profiles and their cascaded data.
-- The admin auth user + profile are preserved.

-- Remove seeded payouts/deals/referrals/leads for non-admin users
delete from public.payouts;
delete from public.deals;
delete from public.referrals;
delete from public.leads;

-- Remove non-admin auth users + profiles
delete from public.profiles where role <> 'admin';
delete from auth.identities
  where user_id in (
    select id from auth.users
    where email <> 'admin@calistaconcept.eu'
  );
delete from auth.users where email <> 'admin@calistaconcept.eu';

-- Ensure admin profile is correct
insert into public.profiles (id, email, full_name, role, level, active, phone, address, avatar_url)
select id, email, 'Calista Admin', 'admin', 'L3', true, '', '', ''
from auth.users
where email = 'admin@calistaconcept.eu'
on conflict (id) do update set
  role = 'admin',
  level = 'L3',
  active = true,
  full_name = 'Calista Admin',
  updated_at = now();

-- =====================================================================
-- DONE. The database now contains ONLY the admin user.
-- Create new users from the admin panel via the Create User tab.
-- =====================================================================
