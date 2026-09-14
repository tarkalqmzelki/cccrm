-- =====================================================================
-- Calista Concept — schema78.sql
-- Run AFTER schema77.sql.
--
-- HOTFIX 3: "column c.body does not exist" — cx_get_state referenced
-- contracts.body, but the contracts table (schema52) stores the text
-- in `notes`. This recreates cx_get_state with the correct column and
-- forces a single clean definition (drops any duplicates first).
-- Safe to run multiple times.
-- =====================================================================

drop function if exists public.cx_get_state(text);

create or replace function public.cx_get_state(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
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
        'start_date', c.start_date, 'end_date', c.end_date, 'body', c.notes)
      from public.contracts c where c.id = v_access.contract_id)
    end
  );

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

grant execute on function public.cx_get_state(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';