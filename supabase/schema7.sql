-- =====================================================================
-- Calista Concept — schema7.sql
-- Run AFTER schema.sql through schema6.sql.
--
-- Fixes: "duplicate key value violates unique constraint users_phone_key"
-- The auth.users table has a unique constraint on phone. Inserting ''
-- (empty string) for every new user collides. Use NULL instead.
-- =====================================================================

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
  v_phone text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create users';
  end if;

  v_id := gen_random_uuid();

  -- Use NULL for empty phone (auth.users has a unique constraint on phone)
  v_phone := nullif(p_phone, '');

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
    now(), now(), '', '', '', '', v_phone
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    phone = excluded.phone,
    updated_at = now();

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email)),
    'email', lower(p_email), now(), now(), now()
  )
  on conflict (provider, provider_id) do update
    set identity_data = excluded.identity_data, updated_at = now();

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
-- DONE. Creating users with empty phone no longer collides.
-- =====================================================================
