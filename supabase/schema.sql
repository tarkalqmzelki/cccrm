-- =====================================================================
-- Calista Concept — Referrals & Revenue SaaS
-- Complete Supabase schema + seed data (auth users, profiles, deals, …)
--
-- Paste this whole file into the Supabase SQL editor and RUN.
-- It is idempotent — safe to re-run.
--
-- Seeded logins:
--   admin@calistaconcept.eu      / admin123   (admin)
--   sofia@calistaconcept.eu      / demo123    (seller L3)
--   luca@calistaconcept.eu       / demo123    (seller L2)
--   giulia@calistaconcept.eu     / demo123    (headhunter L2)
--   marco@calistaconcept.eu      / demo123    (seller L1)
--   elena@calistaconcept.eu      / demo123    (headhunter L1)
-- =====================================================================

-- pgcrypto: needed for crypt() / gen_salt() (bcrypt password hashing)
create extension if not exists pgcrypto;

-- ---------- ENUM TYPES ----------
do $$ begin
  create type user_role as enum ('admin', 'seller', 'headhunter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type seller_level as enum ('L1', 'L2', 'L3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_status as enum (
    'cold_call', 'warm_call', 'unfinished', 'to_be_finished', 'pending_review', 'approved', 'rejected', 'closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payout_status as enum ('pending', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- TABLES
-- =====================================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  full_name       text not null default '',
  role            user_role not null default 'seller',
  level           seller_level not null default 'L1',
  active          boolean not null default true,
  avatar_color    text not null default '#0A0A0A',
  phone           text default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.profiles(id) on delete cascade,
  referee_id    uuid not null references public.profiles(id) on delete cascade,
  note          text default '',
  created_at    timestamptz not null default now(),
  unique (referrer_id, referee_id),
  check (referrer_id <> referee_id)
);

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  company       text not null default '',
  contact_name  text default '',
  email         text default '',
  phone         text default '',
  website       text default '',
  meeting_place text default '',
  status        deal_status not null default 'cold_call',
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.deals (
  id              uuid primary key default gen_random_uuid(),
  seller_id        uuid not null references public.profiles(id) on delete cascade,
  lead_id          uuid references public.leads(id) on delete set null,
  company         text not null default '',
  contact_name    text default '',
  email           text default '',
  phone           text default '',
  website         text default '',
  meeting_place   text default '',
  gross_value     numeric(14,2) not null default 0,
  commission_pct  numeric(5,2) not null default 0,
  status          deal_status not null default 'pending_review',
  notes           text default '',
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists deals_seller_idx on public.deals(seller_id);
create index if not exists deals_status_idx on public.deals(status);
create index if not exists deals_created_idx on public.deals(created_at desc);

create table if not exists public.payouts (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.profiles(id) on delete cascade,
  deal_id       uuid references public.deals(id) on delete set null,
  amount        numeric(14,2) not null default 0,
  status        payout_status not null default 'pending',
  period        text default '',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists payouts_seller_idx on public.payouts(seller_id);

-- =====================================================================
-- UPDATED_AT triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_deals_touch on public.deals;
create trigger trg_deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.referrals  enable row level security;
alter table public.leads      enable row level security;
alter table public.deals      enable row level security;
alter table public.payouts    enable row level security;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "profiles_read"        on public.profiles;
drop policy if exists "profiles_self_update"  on public.profiles;
drop policy if exists "profiles_admin_all"    on public.profiles;
create policy "profiles_read"       on public.profiles for select using (true);
create policy "profiles_self_update" on public.profiles for update using (id = auth.uid());
create policy "profiles_admin_all"  on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "referrals_read"    on public.referrals;
drop policy if exists "referrals_admin_all" on public.referrals;
create policy "referrals_read"    on public.referrals for select using (true);
create policy "referrals_admin_all" on public.referrals for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "leads_owner_read"   on public.leads;
drop policy if exists "leads_owner_write"  on public.leads;
drop policy if exists "leads_owner_update" on public.leads;
create policy "leads_owner_read"   on public.leads for select using (owner_id = auth.uid() or public.is_admin());
create policy "leads_owner_write"  on public.leads for insert with check (owner_id = auth.uid() or public.is_admin());
create policy "leads_owner_update" on public.leads for update using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "deals_seller_read"   on public.deals;
drop policy if exists "deals_seller_insert" on public.deals;
drop policy if exists "deals_admin_update"  on public.deals;
create policy "deals_seller_read"   on public.deals for select using (seller_id = auth.uid() or public.is_admin());
create policy "deals_seller_insert" on public.deals for insert with check (seller_id = auth.uid() or public.is_admin());
create policy "deals_admin_update"  on public.deals for update using (public.is_admin());

drop policy if exists "payouts_seller_read" on public.payouts;
drop policy if exists "payouts_admin_all"   on public.payouts;
create policy "payouts_seller_read" on public.payouts for select using (seller_id = auth.uid() or public.is_admin());
create policy "payouts_admin_all"   on public.payouts for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- AUTO-CREATE PROFILE ON SIGNUP (for future Dashboard signups)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'seller')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- SEED: AUTH USERS  (bcrypt-hashed passwords via pgcrypto)
-- =====================================================================
-- Temporarily detach the signup trigger so our manual inserts don't
-- double-insert profiles (we upsert profiles ourselves below).
drop trigger if exists on_auth_user_created on auth.users;

-- Helper to upsert an auth user with a bcrypt password.
-- Dynamically introspects auth.users columns so it works on ANY Supabase
-- version (the auth schema changes between releases — e.g. email_confirmed
-- was removed, aud/role defaults changed, etc.).
create or replace function public.seed_auth_user(
  p_id       uuid,
  p_email    text,
  p_password text,
  p_meta     jsonb default '{}'::jsonb
) returns void language plpgsql security definer as $$
declare
  v_cols      text[];
  v_col_list  text;
  v_val_list  text;
  v_set_list  text;
  c           text;
  v_exists    boolean;
begin
  -- 1) Gather the columns that actually exist in auth.users
  --    (skip GENERATED columns — e.g. confirmed_at is generated as
  --    coalesce(email_confirmed_at, phone_confirmed_at) in newer GoTrue)
  select array_agg(column_name order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'auth'
    and table_name   = 'users'
    and is_generated = 'NEVER';

  -- 2) Build column / value / ON CONFLICT lists dynamically
  v_col_list := '';
  v_val_list := '';
  v_set_list := '';

  foreach c in array v_cols loop
    case c
      when 'id'                 then v_col_list := v_col_list || 'id,';                         v_val_list := v_val_list || quote_literal(p_id) || ',';
      when 'instance_id'        then v_col_list := v_col_list || 'instance_id,';                v_val_list := v_val_list || '''00000000-0000-0000-0000-000000000000'',';
      when 'aud'                then v_col_list := v_col_list || 'aud,';                        v_val_list := v_val_list || '''authenticated'',';
      when 'role'               then v_col_list := v_col_list || 'role,';                       v_val_list := v_val_list || '''authenticated'',';
      when 'email'              then v_col_list := v_col_list || 'email,';                      v_val_list := v_val_list || quote_literal(lower(p_email)) || ',';
      when 'encrypted_password' then v_col_list := v_col_list || 'encrypted_password,';         v_val_list := v_val_list || quote_literal(crypt(p_password, gen_salt('bf'))) || ',';
      when 'email_confirmed_at' then v_col_list := v_col_list || 'email_confirmed_at,';         v_val_list := v_val_list || 'now(),';
      when 'email_confirmed'    then v_col_list := v_col_list || 'email_confirmed,';            v_val_list := v_val_list || 'true,';
      when 'raw_app_meta_data'  then v_col_list := v_col_list || 'raw_app_meta_data,';          v_val_list := v_val_list || '''{"provider":"email","providers":["email"]}''::jsonb,';
      when 'raw_user_meta_data' then v_col_list := v_col_list || 'raw_user_meta_data,';         v_val_list := v_val_list || quote_literal(p_meta::text) || '::jsonb,';
      when 'created_at'         then v_col_list := v_col_list || 'created_at,';                 v_val_list := v_val_list || 'now(),';
      when 'updated_at'         then v_col_list := v_col_list || 'updated_at,';                 v_val_list := v_val_list || 'now(),';
      when 'last_sign_in_at'    then v_col_list := v_col_list || 'last_sign_in_at,';            v_val_list := v_val_list || 'null,';
      when 'confirmation_token' then v_col_list := v_col_list || 'confirmation_token,';         v_val_list := v_val_list || ''''',';
      when 'recovery_token'     then v_col_list := v_col_list || 'recovery_token,';             v_val_list := v_val_list || ''''',';
      when 'email_change_token_new' then v_col_list := v_col_list || 'email_change_token_new,'; v_val_list := v_val_list || ''''',';
      when 'email_change'       then v_col_list := v_col_list || 'email_change,';               v_val_list := v_val_list || ''''',';
      when 'email_change_token_current' then v_col_list := v_col_list || 'email_change_token_current,'; v_val_list := v_val_list || ''''',';
      when 'phone'              then v_col_list := v_col_list || 'phone,';                      v_val_list := v_val_list || 'null,';
      when 'phone_change_token' then v_col_list := v_col_list || 'phone_change_token,';         v_val_list := v_val_list || ''''',';
      when 'phone_change'       then v_col_list := v_col_list || 'phone_change,';               v_val_list := v_val_list || ''''',';
      when 'phone_change_at'    then v_col_list := v_col_list || 'phone_change_at,';            v_val_list := v_val_list || 'null,';
      when 'banned_until'       then v_col_list := v_col_list || 'banned_until,';               v_val_list := v_val_list || 'null,';
      when 'reauthentication_token' then v_col_list := v_col_list || 'reauthentication_token,'; v_val_list := v_val_list || ''''',';
      when 'reauthentication_sent_at' then v_col_list := v_col_list || 'reauthentication_sent_at,'; v_val_list := v_val_list || 'null,';
      when 'confirmation_sent_at' then v_col_list := v_col_list || 'confirmation_sent_at,';     v_val_list := v_val_list || 'null,';
      when 'deleted_at'         then v_col_list := v_col_list || 'deleted_at,';                 v_val_list := v_val_list || 'null,';
      else
        -- skip any other column we don't explicitly handle (let DB defaults apply)
        continue;
    end case;

    -- build the ON CONFLICT update list (skip id / created_at)
    if c not in ('id', 'created_at', 'instance_id') then
      v_set_list := v_set_list || c || ' = excluded.' || c || ',';
    end if;
  end loop;

  -- trim trailing commas
  v_col_list := rtrim(v_col_list, ',');
  v_val_list := rtrim(v_val_list, ',');
  v_set_list := rtrim(v_set_list, ',');

  -- 3) Execute the dynamic INSERT ... ON CONFLICT
  execute format(
    'insert into auth.users (%s) values (%s) on conflict (id) do update set %s',
    v_col_list, v_val_list, v_set_list
  );

  -- 4) Keep auth.identities in sync (some Supabase versions require it)
  select exists(select 1 from information_schema.columns
    where table_schema='auth' and table_name='identities')
  into v_exists;

  if v_exists then
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), p_id,
      jsonb_build_object('sub', p_id::text, 'email', lower(p_email)),
      'email', lower(p_email), now(), now(), now()
    )
    on conflict (provider, provider_id) do update
      set identity_data = excluded.identity_data, updated_at = now();
  end if;
end $$;

-- Fixed UUIDs so referrals/deals can reference them deterministically.
--   admin   a0000000-0000-0000-0000-000000000001
--   sofia   a0000000-0000-0000-0000-000000000002
--   luca    a0000000-0000-0000-0000-000000000003
--   giulia  a0000000-0000-0000-0000-000000000004
--   marco   a0000000-0000-0000-0000-000000000005
--   elena   a0000000-0000-0000-0000-000000000006

select public.seed_auth_user('a0000000-0000-0000-0000-000000000001', 'admin@calistaconcept.eu', 'admin123', '{"full_name":"Calista Admin"}');
select public.seed_auth_user('a0000000-0000-0000-0000-000000000002', 'sofia@calistaconcept.eu',  'demo123',  '{"full_name":"Sofia Marchetti"}');
select public.seed_auth_user('a0000000-0000-0000-0000-000000000003', 'luca@calistaconcept.eu',   'demo123',  '{"full_name":"Luca Romano"}');
select public.seed_auth_user('a0000000-0000-0000-0000-000000000004', 'giulia@calistaconcept.eu', 'demo123',  '{"full_name":"Giulia Bianchi"}');
select public.seed_auth_user('a0000000-0000-0000-0000-000000000005', 'marco@calistaconcept.eu',  'demo123',  '{"full_name":"Marco Esposito"}');
select public.seed_auth_user('a0000000-0000-0000-0000-000000000006', 'elena@calistaconcept.eu',  'demo123',  '{"full_name":"Elena Conti"}');

-- cleanup helper (kept for re-runs / future use)
drop function if exists public.seed_auth_user(uuid, text, text, jsonb);

-- =====================================================================
-- SEED: PROFILES
-- =====================================================================
insert into public.profiles (id, email, full_name, role, level, active, avatar_color, phone) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@calistaconcept.eu', 'Calista Admin',   'admin',      'L3', true, '#0A0A0A', ''),
  ('a0000000-0000-0000-0000-000000000002', 'sofia@calistaconcept.eu', 'Sofia Marchetti', 'seller',     'L3', true, '#171717', '+39 333 1122334'),
  ('a0000000-0000-0000-0000-000000000003', 'luca@calistaconcept.eu',  'Luca Romano',     'seller',     'L2', true, '#262626', '+39 340 5566778'),
  ('a0000000-0000-0000-0000-000000000004', 'giulia@calistaconcept.eu','Giulia Bianchi',  'headhunter', 'L2', true, '#404040', '+39 348 9900112'),
  ('a0000000-0000-0000-0000-000000000005', 'marco@calistaconcept.eu', 'Marco Esposito',  'seller',     'L1', true, '#525252', '+39 320 4455667'),
  ('a0000000-0000-0000-0000-000000000006', 'elena@calistaconcept.eu', 'Elena Conti',     'headhunter', 'L1', true, '#737373', '+39 351 2233445')
on conflict (id) do update set
  email        = excluded.email,
  full_name    = excluded.full_name,
  role         = excluded.role,
  level        = excluded.level,
  active       = excluded.active,
  avatar_color = excluded.avatar_color,
  phone        = excluded.phone,
  updated_at   = now();

-- =====================================================================
-- SEED: REFERRALS
-- =====================================================================
insert into public.referrals (referrer_id, referee_id, note) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Founding seller'),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', ''),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'Strong network in luxury'),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', ''),
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000006', '')
on conflict (referrer_id, referee_id) do update set note = excluded.note;

-- =====================================================================
-- SEED: LEADS
-- =====================================================================
insert into public.leads (id, owner_id, company, contact_name, email, phone, website, meeting_place, status, notes) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Atelier Noir',     'Camille Faure',   'camille@ateliernoir.fr', '+33 1 4020 3040',  'ateliernoir.fr',     'Milan Showroom', 'warm_call',      'Interested in Q4 launch.'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Maison Verde',     'Paolo Greco',     'paolo@maisonverde.it',   '+39 02 998877',     'maisonverde.it',     'Zoom',           'cold_call',      ''),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'Bespoke Studio',   'Lina Hoffmann',   'lina@bespoke.de',        '+49 30 2200 3300',  'bespoke-studio.de',  'Berlin office',  'to_be_finished', 'Awaiting proposal.')
on conflict (id) do nothing;

-- =====================================================================
-- SEED: DEALS  (deterministic ids so payouts can reference them)
-- =====================================================================
insert into public.deals (id, seller_id, company, contact_name, email, phone, website, meeting_place, gross_value, commission_pct, status, notes, closed_at, created_at) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Atelier Noir',   'Camille Faure',  '', '', '', '', 48000, 12, 'closed',          '', now() - interval '6 day',  now() - interval '6 day'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Lumen Group',    'S. Renard',      '', '', '', '', 32000, 10, 'approved',        '', null, now() - interval '3 day'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Domus Italia',   'F. Carli',       '', '', '', '', 21000, 8,  'pending_review',  '', null, now() - interval '1 day'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Maison Verde',   'Paolo Greco',    '', '', '', '', 27500, 9,  'closed',          '', now() - interval '9 day',  now() - interval '9 day'),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Vesta Living',   'M. Conti',       '', '', '', '', 15600, 8,  'approved',        '', null, now() - interval '4 day'),
  ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', 'Bespoke Studio', 'Lina Hoffmann',  '', '', '', '', 62000, 14, 'pending_review',  '', null, now() - interval '2 day'),
  ('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000004', 'Nordic Forms',   'E. Lind',        '', '', '', '', 18000, 7,  'closed',          '', now() - interval '14 day', now() - interval '14 day'),
  ('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000005', 'Pura Casa',      'G. Sole',        '', '', '', '', 9800,  6,  'rejected',        '', null, now() - interval '5 day'),
  ('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000005', 'Casa Vera',      'R. Vito',        '', '', '', '', 11200, 6,  'pending_review',  '', null, now() - interval '2 day'),
  ('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000006', 'Maison Verde',   'Paolo Greco',    '', '', '', '', 7400,  5,  'warm_call',       '', null, now())
on conflict (id) do update set
  seller_id       = excluded.seller_id,
  company         = excluded.company,
  contact_name    = excluded.contact_name,
  gross_value     = excluded.gross_value,
  commission_pct  = excluded.commission_pct,
  status          = excluded.status,
  closed_at       = excluded.closed_at,
  updated_at      = now();

-- =====================================================================
-- SEED: PAYOUTS  (auto-derived from closed/approved deals)
-- =====================================================================
insert into public.payouts (seller_id, deal_id, amount, status, period, created_at, paid_at)
select
  d.seller_id, d.id,
  round(d.gross_value * (d.commission_pct / 100.0), 2),
  case when d.status = 'closed' then 'paid' else 'pending' end::payout_status,
  to_char(d.created_at, 'YYYY-MM'),
  d.created_at,
  case when d.status = 'closed' then d.closed_at else null end
from public.deals d
where d.status in ('closed', 'approved')
on conflict do nothing;

-- =====================================================================
-- Re-enable the signup trigger for future Dashboard-created users
-- =====================================================================
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- DONE
-- Log in with any of the seeded emails above.
-- Admin: admin@calistaconcept.eu / admin123
-- =====================================================================
