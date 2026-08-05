-- =====================================================================
-- Calista Concept — schema10.sql
-- Companies & Opportunities module.
-- Run AFTER schema.sql through schema9.sql. Does not break existing data.
-- =====================================================================

-- ---------- ENUM TYPES ----------
do $$ begin
  create type opp_status as enum (
    'new','researching','contact_found','contacted','interested',
    'meeting_scheduled','proposal_sent','negotiation','won','lost','archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_type as enum (
    'note','call','email','meeting','message','reminder','upload','status_change','created'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('open','in_progress','done','cancelled');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- ADD uid TO PROFILES (for contact-unlock OTP verification)
-- =====================================================================
alter table public.profiles
  add column if not exists uid text;

-- Backfill existing profiles with a random 6-char UID
update public.profiles
  set uid = upper(substr(encode(gen_random_bytes(4),'hex'),1,6))
where uid is null or uid = '';

-- =====================================================================
-- SERVICE CATALOG
-- =====================================================================
create table if not exists public.service_catalog (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  is_custom   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Seed default services
insert into public.service_catalog (name, slug, is_custom) values
  ('Website','website',false),
  ('Software','software',false),
  ('ERP','erp',false),
  ('CRM','crm',false),
  ('AI','ai',false),
  ('Marketing','marketing',false),
  ('SEO','seo',false),
  ('Mobile App','mobile_app',false),
  ('Consulting','consulting',false),
  ('Other','other',false)
on conflict (slug) do nothing;

alter table public.service_catalog enable row level security;
drop policy if exists "services_read" on public.service_catalog;
drop policy if exists "services_admin_write" on public.service_catalog;
create policy "services_read" on public.service_catalog for select using (true);
create policy "services_admin_write" on public.service_catalog for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- COMPANIES  (root entity — no owner, unique by domain/vat)
-- =====================================================================
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  website       text default '',
  domain        text default '',
  vat_number    text default '',
  industry      text default '',
  description   text default '',
  address       text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unique indexes for duplicate detection
create unique index if not exists companies_domain_uniq
  on public.companies (lower(domain)) where domain <> '';
create unique index if not exists companies_vat_uniq
  on public.companies (vat_number) where vat_number <> '';
create unique index if not exists companies_website_uniq
  on public.companies (lower(website)) where website <> '';

create index if not exists companies_name_idx on public.companies (lower(name));

alter table public.companies enable row level security;
drop policy if exists "companies_all_read" on public.companies;
drop policy if exists "companies_admin_all" on public.companies;
create policy "companies_all_read" on public.companies for select using (true);
create policy "companies_admin_all" on public.companies for all
  using (public.is_admin()) with check (public.is_admin());

-- sellers can insert/update companies
drop policy if exists "companies_seller_insert" on public.companies;
create policy "companies_seller_insert" on public.companies for insert
  with check (true);
drop policy if exists "companies_seller_update" on public.companies;
create policy "companies_seller_update" on public.companies for update
  using (true);

-- =====================================================================
-- CONTACTS  (belong to Company, shared across Opportunities)
-- =====================================================================
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  full_name   text not null default '',
  email       text default '',
  phone       text default '',
  role        text default '',
  linkedin    text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contacts_company_idx on public.contacts(company_id);

alter table public.contacts enable row level security;
drop policy if exists "contacts_all_read" on public.contacts;
drop policy if exists "contacts_all_insert" on public.contacts;
drop policy if exists "contacts_all_update" on public.contacts;
drop policy if exists "contacts_admin_delete" on public.contacts;
create policy "contacts_all_read" on public.contacts for select using (true);
create policy "contacts_all_insert" on public.contacts for insert with check (true);
create policy "contacts_all_update" on public.contacts for update using (true);
create policy "contacts_admin_delete" on public.contacts for delete using (public.is_admin());

-- =====================================================================
-- OPPORTUNITIES  (one sales engagement — owned)
-- =====================================================================
create table if not exists public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  service_id      uuid not null references public.service_catalog(id) on delete restrict,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  title           text not null default '',
  status          opp_status not null default 'new',
  priority        text not null default 'medium',  -- low/medium/high
  est_revenue     numeric(14,2) not null default 0,
  next_follow_up  timestamptz,
  notes           text default '',
  converted_deal_id uuid references public.deals(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists opp_company_idx on public.opportunities(company_id);
create index if not exists opp_owner_idx on public.opportunities(owner_id);
create index if not exists opp_status_idx on public.opportunities(status);
create index if not exists opp_service_idx on public.opportunities(service_id);

alter table public.opportunities enable row level security;
drop policy if exists "opp_all_read" on public.opportunities;
drop policy if exists "opp_owner_insert" on public.opportunities;
drop policy if exists "opp_owner_update" on public.opportunities;
drop policy if exists "opp_admin_delete" on public.opportunities;
create policy "opp_all_read" on public.opportunities for select using (true);
create policy "opp_owner_insert" on public.opportunities for insert with check (owner_id = auth.uid() or public.is_admin());
create policy "opp_owner_update" on public.opportunities for update using (owner_id = auth.uid() or public.is_admin());
create policy "opp_admin_delete" on public.opportunities for delete using (public.is_admin());

-- =====================================================================
-- OPPORTUNITY CONTACTS (many-to-many: which contacts are involved)
-- =====================================================================
create table if not exists public.opportunity_contacts (
  id           uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  unique (opportunity_id, contact_id)
);

alter table public.opportunity_contacts enable row level security;
drop policy if exists "opp_contacts_read" on public.opportunity_contacts;
drop policy if exists "opp_contacts_write" on public.opportunity_contacts;
create policy "opp_contacts_read" on public.opportunity_contacts for select using (true);
create policy "opp_contacts_write" on public.opportunity_contacts for all
  using (true) with check (true);

-- =====================================================================
-- ACTIVITIES  (immutable log — calls, emails, notes, status changes, etc.)
-- =====================================================================
create table if not exists public.activities (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  type            activity_type not null default 'note',
  title           text not null default '',
  description     text default '',
  old_status      opp_status,
  new_status      opp_status,
  created_at      timestamptz not null default now()
);

create index if not exists act_opp_idx on public.activities(opportunity_id);
create index if not exists act_company_idx on public.activities(company_id);
create index if not exists act_created_idx on public.activities(created_at desc);

alter table public.activities enable row level security;
drop policy if exists "activities_read" on public.activities;
drop policy if exists "activities_insert" on public.activities;
create policy "activities_read" on public.activities for select using (true);
create policy "activities_insert" on public.activities for insert with check (true);

-- =====================================================================
-- TASKS  (belong to opportunities)
-- =====================================================================
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  assignee_id     uuid references public.profiles(id) on delete set null,
  title           text not null default '',
  description     text default '',
  status          task_status not null default 'open',
  due_date        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_opp_idx on public.tasks(opportunity_id);

alter table public.tasks enable row level security;
drop policy if exists "tasks_all_read" on public.tasks;
drop policy if exists "tasks_owner_insert" on public.tasks;
drop policy if exists "tasks_owner_update" on public.tasks;
drop policy if exists "tasks_admin_delete" on public.tasks;
create policy "tasks_all_read" on public.tasks for select using (true);
create policy "tasks_owner_insert" on public.tasks for insert with check (true);
create policy "tasks_owner_update" on public.tasks for update using (true);
create policy "tasks_admin_delete" on public.tasks for delete using (public.is_admin());

-- =====================================================================
-- COMPANY NOTES  (shared internal notes for coordination)
-- =====================================================================
create table if not exists public.company_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists notes_company_idx on public.company_notes(company_id);

alter table public.company_notes enable row level security;
drop policy if exists "notes_read" on public.company_notes;
drop policy if exists "notes_insert" on public.company_notes;
drop policy if exists "notes_admin_delete" on public.company_notes;
create policy "notes_read" on public.company_notes for select using (true);
create policy "notes_insert" on public.company_notes for insert with check (true);
create policy "notes_admin_delete" on public.company_notes for delete using (public.is_admin());

-- =====================================================================
-- OPPORTUNITY NOTES  (private to the opportunity)
-- =====================================================================
create table if not exists public.opportunity_notes (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists opp_notes_opp_idx on public.opportunity_notes(opportunity_id);

alter table public.opportunity_notes enable row level security;
drop policy if exists "opp_notes_read" on public.opportunity_notes;
drop policy if exists "opp_notes_insert" on public.opportunity_notes;
drop policy if exists "opp_notes_admin_delete" on public.opportunity_notes;
create policy "opp_notes_read" on public.opportunity_notes for select using (true);
create policy "opp_notes_insert" on public.opportunity_notes for insert with check (true);
create policy "opp_notes_admin_delete" on public.opportunity_notes for delete using (public.is_admin());

-- =====================================================================
-- LINK DEALS → OPPORTUNITIES  (add opportunity_id to deals)
-- =====================================================================
alter table public.deals
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;

-- =====================================================================
-- TRIGGERS: touch updated_at
-- =====================================================================
drop trigger if exists trg_companies_touch on public.companies;
create trigger trg_companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_contacts_touch on public.contacts;
create trigger trg_contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_opp_touch on public.opportunities;
create trigger trg_opp_touch before update on public.opportunities
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- TRIGGER: auto-create activity on opportunity status change
-- =====================================================================
create or replace function public.log_opp_status_change()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activities (opportunity_id, company_id, actor_id, type, title, new_status)
    values (new.id, new.company_id, new.owner_id, 'created', 'Opportunity created', new.status);
  elsif tg_op = 'UPDATE' and coalesce(new.status::text,'') <> coalesce(old.status::text,'') then
    insert into public.activities (opportunity_id, company_id, actor_id, type, title, old_status, new_status)
    values (new.id, new.company_id, new.owner_id, 'status_change',
      'Status: ' || coalesce(old.status::text,'') || ' → ' || coalesce(new.status::text,''),
      old.status, new.status);
  end if;
  return new;
end $$;

drop trigger if exists trg_opp_status_log on public.opportunities;
create trigger trg_opp_status_log
  after insert or update on public.opportunities
  for each row execute function public.log_opp_status_change();

-- =====================================================================
-- UPDATE create_user() to also generate a UID
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
  v_uid  text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create users';
  end if;

  v_id := gen_random_uuid();
  v_phone := nullif(p_phone, '');
  v_uid := upper(substr(encode(gen_random_bytes(4),'hex'),1,6));

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

  insert into public.profiles (id, email, full_name, role, level, phone, active, uid)
  values (v_id, lower(p_email), p_full_name, p_role::user_role, p_level::seller_level, p_phone, true, v_uid)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    level = excluded.level,
    phone = excluded.phone,
    uid = coalesce(profiles.uid, excluded.uid),
    updated_at = now();

  return v_id;
end $$;

-- =====================================================================
-- Refresh schema cache
-- =====================================================================
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE.
-- Tables: companies, contacts, opportunities, opportunity_contacts,
--         activities, tasks, company_notes, opportunity_notes,
--         service_catalog.
-- Profiles now have a uid column for contact-unlock verification.
-- Deals now have an opportunity_id link.
-- =====================================================================
