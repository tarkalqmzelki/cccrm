-- =====================================================================
-- Calista Concept — schema74.sql
-- Run AFTER schema73.sql.
--
-- CLIENT EXPERIENCE — secure, temporary client-facing layer over
-- approved deals. Clients access ONLY through security-definer RPCs
-- keyed by a SHA-256 token hash. Raw tokens are never stored.
-- REQUIRES pgcrypto (enabled below) for the digest() function.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.client_experience_access (
  id                    uuid primary key default gen_random_uuid(),
  deal_id               uuid not null unique references public.deals(id) on delete cascade,
  token_hash            text not null unique,
  client_name           text not null default '',
  client_email          text not null default '',
  status                text not null default 'active' check (status in ('active','revoked')),
  expires_at            timestamptz not null default now() + interval '30 days',
  revoked_at            timestamptz,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  last_accessed_at      timestamptz,
  access_count          int not null default 0,
  accepted_at           timestamptz,
  declined_at           timestamptz,
  decline_reason        text not null default '',
  contract_id           uuid references public.contracts(id) on delete set null,
  contract_accepted_at  timestamptz,
  onboarding            jsonb not null default '{}'::jsonb,
  onboarding_status     text not null default 'not_started'
                        check (onboarding_status in ('not_started','in_progress','completed'))
);

create unique index if not exists cxa_token_hash_idx on public.client_experience_access(token_hash);
create index if not exists cxa_deal_idx on public.client_experience_access(deal_id);

alter table public.client_experience_access enable row level security;
drop policy if exists "cxa_admin" on public.client_experience_access;
create policy "cxa_admin" on public.client_experience_access for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists public.cx_milestones (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  title         text not null default '',
  description   text not null default '',
  status        text not null default 'planned'
                check (status in ('planned','in_progress','waiting_client','completed')),
  position      int not null default 0,
  start_date    date,
  end_date      date,
  completed_at  timestamptz,
  revision_note text not null default '',
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cxm_deal_idx on public.cx_milestones(deal_id);

alter table public.cx_milestones enable row level security;
drop policy if exists "cxm_admin" on public.cx_milestones;
create policy "cxm_admin" on public.cx_milestones for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists public.client_experience_events (
  id           uuid primary key default gen_random_uuid(),
  access_id    uuid not null references public.client_experience_access(id) on delete cascade,
  event_type   text not null,
  actor_type   text not null default 'system' check (actor_type in ('client','system','seller')),
  entity_type  text not null default '',
  entity_id    text not null default '',
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists cxe_access_idx on public.client_experience_events(access_id, created_at desc);

alter table public.client_experience_events enable row level security;
drop policy if exists "cxe_admin" on public.client_experience_events;
create policy "cxe_admin" on public.client_experience_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists public.client_experience_messages (
  id              uuid primary key default gen_random_uuid(),
  access_id       uuid not null references public.client_experience_access(id) on delete cascade,
  sender          text not null check (sender in ('client','seller')),
  body            text not null default '',
  read_by_seller  boolean not null default false,
  read_by_client  boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists cxmsg_access_idx on public.client_experience_messages(access_id, created_at);

alter table public.client_experience_messages enable row level security;
drop policy if exists "cxmsg_admin" on public.client_experience_messages;
create policy "cxmsg_admin" on public.client_experience_messages for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create table if not exists public.cx_files (
  id           uuid primary key default gen_random_uuid(),
  access_id    uuid not null references public.client_experience_access(id) on delete cascade,
  deal_id      uuid references public.deals(id) on delete cascade,
  name         text not null default '',
  storage_path text not null default '',
  size_bytes   bigint not null default 0,
  mime         text not null default '',
  uploaded_by  text not null default 'client' check (uploaded_by in ('client','seller')),
  created_at   timestamptz not null default now()
);

alter table public.cx_files enable row level security;
drop policy if exists "cxf_admin" on public.cx_files;
create policy "cxf_admin" on public.cx_files for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Milestone events — automatic
-- ---------------------------------------------------------------------
create or replace function public.tr_cx_milestone_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_access uuid;
begin
  select id into v_access from public.client_experience_access where deal_id = new.deal_id limit 1;
  if v_access is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id, metadata)
    values (v_access, 'milestone_created', 'seller', 'milestone', new.id::text,
      jsonb_build_object('title', new.title, 'status', new.status::text));
  elsif tg_op = 'UPDATE' and coalesce(new.status::text,'') <> coalesce(old.status::text,'') then
    insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id, metadata)
    values (v_access, case when new.status::text = 'completed' then 'milestone_completed' else 'milestone_updated' end,
      'seller', 'milestone', new.id::text, jsonb_build_object('title', new.title, 'status', new.status::text));
  end if;
  return new;
end $$;

drop trigger if exists trg_cx_milestone_event on public.cx_milestones;
create trigger trg_cx_milestone_event
  after insert or update of status on public.cx_milestones
  for each row execute function public.tr_cx_milestone_event();

-- ---------------------------------------------------------------------
-- CORE RPC — validate token + full sanitized snapshot
-- ---------------------------------------------------------------------
create or replace function public.cx_get_state(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_access public.client_experience_access%rowtype;
  v_deal public.deals%rowtype;
  v_company public.companies%rowtype;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select * into v_access from public.client_experience_access where token_hash = v_hash;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;
  if v_access.status = 'revoked' or v_access.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'REVOKED');
  end if;
  if v_access.expires_at is not null and v_access.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'EXPIRED');
  end if;

  select * into v_deal from public.deals where id = v_access.deal_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  if v_access.last_accessed_at is null or v_access.last_accessed_at < now() - interval '1 minute' then
    update public.client_experience_access
      set last_accessed_at = now(), access_count = access_count + 1
      where id = v_access.id;
  end if;

  if not exists (
    select 1 from public.client_experience_events
    where access_id = v_access.id and event_type = 'experience_opened'
      and created_at::date = now()::date
  ) then
    insert into public.client_experience_events (access_id, event_type, actor_type)
    values (v_access.id, 'experience_opened', 'client');
  end if;

  select * into v_company from public.companies where lower(name) = lower(v_deal.company) limit 1;

  v_result := jsonb_build_object(
    'ok', true,
    'expires_at', v_access.expires_at,
    'client_name', v_access.client_name,
    'client_email', v_access.client_email,
    'accepted_at', v_access.accepted_at,
    'declined_at', v_access.declined_at,
    'decline_reason', v_access.decline_reason,
    'contract_id', v_access.contract_id,
    'contract_accepted_at', v_access.contract_accepted_at,
    'onboarding', v_access.onboarding,
    'onboarding_status', v_access.onboarding_status,
    'deal', jsonb_build_object(
      'id', v_deal.id,
      'company', v_deal.company,
      'contact_name', v_deal.contact_name,
      'email', v_deal.email,
      'phone', v_deal.phone,
      'website', v_deal.website,
      'status', v_deal.status::text,
      'value', v_deal.gross_value,
      'created_at', v_deal.created_at,
      'closed_at', v_deal.closed_at
    ),
    'company', coalesce(to_jsonb(v_company), 'null'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender', m.sender, 'body', m.body,
        'created_at', m.created_at) order by m.created_at)
      from public.client_experience_messages m where m.access_id = v_access.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'actor_type', e.actor_type,
        'metadata', e.metadata, 'created_at', e.created_at) order by e.created_at desc)
      from (select * from public.client_experience_events where access_id = v_access.id
            order by created_at desc limit 30) e
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'size_bytes', f.size_bytes, 'mime', f.mime,
        'uploaded_by', f.uploaded_by, 'created_at', f.created_at) order by f.created_at desc)
      from public.cx_files f where f.access_id = v_access.id
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ms.id, 'title', ms.title, 'description', ms.description,
        'status', ms.status::text, 'position', ms.position,
        'start_date', ms.start_date, 'end_date', ms.end_date,
        'revision_note', ms.revision_note) order by ms.position)
      from public.cx_milestones ms where ms.deal_id = v_deal.id
    ), '[]'::jsonb),
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description,
        'status', t.status::text, 'due_date', t.due_date) order by t.due_date nulls last)
      from public.tasks t where t.opportunity_id = v_deal.opportunity_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'status', i.status::text,
        'issue_date', i.issue_date, 'due_date', i.due_date,
        'total', (select coalesce(sum(s.quantity * s.unit_price), 0)
                  from public.invoice_services s where s.invoice_id = i.id),
        'vat_pct', i.vat_pct, 'vat_included', i.vat_included)
        order by i.issue_date desc)
      from public.invoices i
      where i.billed_to ilike '%' || v_deal.company || '%'
    ), '[]'::jsonb),
    'contract', case
      when v_access.contract_id is null then null
      else (select jsonb_build_object(
        'id', c.id, 'number', c.number, 'status', c.status::text,
        'counterparty_name', c.counterparty_name, 'counterparty_company', c.counterparty_company,
        'start_date', c.start_date, 'end_date', c.end_date, 'body', c.body)
      from public.contracts c where c.id = v_access.contract_id)
    end
  );

  -- Proposal block: linked opportunity (sanitized), else deal fields
  if v_deal.opportunity_id is not null then
    v_result := jsonb_set(v_result, '{opportunity}', coalesce((
      select jsonb_build_object(
        'id', o.id, 'title', o.title, 'status', o.status::text,
        'offer_value', o.offer_value, 'offer_description', o.offer_description,
        'priority', o.priority::text)
      from public.opportunities o where o.id = v_deal.opportunity_id
    ), 'null'::jsonb));
  else
    v_result := jsonb_set(v_result, '{opportunity}', jsonb_build_object(
      'id', null, 'title', 'Project proposal', 'status', null,
      'offer_value', v_deal.gross_value, 'offer_description', v_deal.notes));
  end if;

  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- Client actions
-- ---------------------------------------------------------------------
create or replace function public.cx_accept_proposal(p_token text, p_signature text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found or v_access.status <> 'active' or v_access.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;
  if v_access.accepted_at is not null then
    return jsonb_build_object('ok', true);
  end if;

  select * into v_deal from public.deals where id = v_access.deal_id;

  update public.client_experience_access set accepted_at = now() where id = v_access.id;
  if v_deal.opportunity_id is not null then
    update public.opportunities set status = 'won' where id = v_deal.opportunity_id;
  end if;

  insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id, metadata)
  values (v_access.id, 'proposal_accepted', 'client', 'deal', v_deal.id::text,
    jsonb_build_object('signature', p_signature));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'Client accepted the proposal',
    coalesce(v_access.client_name, v_deal.company) || ' accepted the proposal for "' || coalesce(v_deal.company, 'Untitled') || '".',
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_proposal_accepted', 'deal_id', v_deal.id),
    'admin_inbox'
  );

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cx_decline_proposal(p_token text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_deal from public.deals where id = v_access.deal_id;

  update public.client_experience_access
    set declined_at = now(), decline_reason = coalesce(p_reason, '') where id = v_access.id;

  insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id, metadata)
  values (v_access.id, 'proposal_declined', 'client', 'deal', v_deal.id::text,
    jsonb_build_object('reason', coalesce(p_reason, '')));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'Client declined the proposal',
    v_deal.company || ': ' || coalesce(p_reason, 'No reason provided.'),
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_proposal_declined', 'deal_id', v_deal.id),
    'admin_inbox'
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cx_approve_contract(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found or v_access.status <> 'active' or v_access.accepted_at is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_deal from public.deals where id = v_access.deal_id;

  update public.client_experience_access set contract_accepted_at = now() where id = v_access.id;
  if v_access.contract_id is not null then
    update public.contracts set status = 'active' where id = v_access.contract_id;
  end if;

  insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id)
  values (v_access.id, 'contract_approved', 'client', 'contract', coalesce(v_access.contract_id::text, ''));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'Client approved the contract',
    v_deal.company || ' approved the contract — project can start.',
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_contract_approved', 'deal_id', v_deal.id),
    'admin_inbox'
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cx_submit_onboarding(p_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found or v_access.status <> 'active' or v_access.accepted_at is null then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_deal from public.deals where id = v_access.deal_id;

  update public.client_experience_access
    set onboarding = p_data, onboarding_status = 'completed' where id = v_access.id;

  update public.companies set
    address = coalesce(nullif(p_data->>'address', ''), address),
    phone = coalesce(nullif(p_data->>'phone', ''), phone),
    vat_number = coalesce(nullif(p_data->>'vat_number', ''), vat_number),
    website = coalesce(nullif(p_data->>'website', ''), website),
    updated_at = now()
  where lower(name) = lower(v_deal.company);

  if coalesce(p_data->>'requirements', '') <> '' then
    update public.deals set notes =
      coalesce(notes, '') || case when coalesce(notes,'') = '' then '' else chr(10) end
      || '--- Client brief ---' || chr(10) || (p_data->>'requirements')
    where id = v_deal.id;
  end if;

  insert into public.client_experience_events (access_id, event_type, actor_type, metadata)
  values (v_access.id, 'onboarding_completed', 'client',
    jsonb_build_object('fields', (select count(*) from jsonb_object_keys(p_data))));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'Client onboarding completed',
    v_deal.company || ' submitted onboarding information — check the Client Experience panel.',
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_onboarding', 'deal_id', v_deal.id),
    'admin_inbox'
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cx_send_message(p_token text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found or v_access.status <> 'active' or v_access.expires_at < now() then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_deal from public.deals where id = v_access.deal_id;

  insert into public.client_experience_messages (access_id, sender, body)
  values (v_access.id, 'client', left(p_body, 4000));

  insert into public.client_experience_events (access_id, event_type, actor_type, metadata)
  values (v_access.id, 'message_sent', 'client', jsonb_build_object('preview', left(p_body, 80)));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'New message from client',
    v_deal.company || ': ' || left(p_body, 200),
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_message', 'deal_id', v_deal.id),
    'admin_inbox'
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cx_approve_milestone(p_token text, p_milestone_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_ms public.cx_milestones%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_ms from public.cx_milestones where id = p_milestone_id and deal_id = v_access.deal_id;
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_deal from public.deals where id = v_access.deal_id;

  update public.cx_milestones set status = 'completed', completed_at = now() where id = v_ms.id;

  insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id, metadata)
  values (v_access.id, 'approval_completed', 'client', 'milestone', v_ms.id::text,
    jsonb_build_object('title', v_ms.title));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'Client approved: ' || v_ms.title,
    v_deal.company || ' approved the milestone "' || v_ms.title || '".',
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_milestone_approved', 'deal_id', v_deal.id, 'milestone_id', v_ms.id::text),
    'admin_inbox'
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cx_request_change(p_token text, p_milestone_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_access public.client_experience_access%rowtype; v_ms public.cx_milestones%rowtype; v_deal public.deals%rowtype;
begin
  select * into v_access from public.client_experience_access
    where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_ms from public.cx_milestones where id = p_milestone_id and deal_id = v_access.deal_id;
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_deal from public.deals where id = v_access.deal_id;

  update public.cx_milestones
    set status = 'in_progress', revision_note = coalesce(p_note, ''), updated_at = now()
    where id = v_ms.id;

  insert into public.client_experience_events (access_id, event_type, actor_type, entity_type, entity_id, metadata)
  values (v_access.id, 'change_requested', 'client', 'milestone', v_ms.id::text,
    jsonb_build_object('title', v_ms.title, 'note', coalesce(p_note, '')));

  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata, notification_key)
  values (
    coalesce(v_access.created_by, v_deal.seller_id), auth.uid(), 'system',
    'Client requested a revision',
    v_deal.company || ' requested a revision on "' || v_ms.title || '": ' || coalesce(p_note, ''),
    '/deals/' || v_deal.id,
    jsonb_build_object('kind', 'cx_change_requested', 'deal_id', v_deal.id, 'milestone_id', v_ms.id::text),
    'admin_inbox'
  );
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.cx_get_state(text) to anon, authenticated;
grant execute on function public.cx_accept_proposal(text, text) to anon, authenticated;
grant execute on function public.cx_decline_proposal(text, text) to anon, authenticated;
grant execute on function public.cx_approve_contract(text) to anon, authenticated;
grant execute on function public.cx_submit_onboarding(text, jsonb) to anon, authenticated;
grant execute on function public.cx_send_message(text, text) to anon, authenticated;
grant execute on function public.cx_approve_milestone(text, uuid) to anon, authenticated;
grant execute on function public.cx_request_change(text, uuid, text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';