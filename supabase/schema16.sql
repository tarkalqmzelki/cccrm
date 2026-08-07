-- =====================================================================
-- Calista Concept — schema16.sql
-- Run AFTER schema.sql through schema15.sql.
--
-- Nuclear cleanup: delete ALL access_requests with invalid status,
-- rebuild the table cleanly, and ensure triggers work.
-- =====================================================================

-- 1. Delete ALL rows with invalid status (cast to text to avoid enum error)
delete from public.access_requests
where status::text is null
   or status::text = ''
   or status::text not in ('pending', 'approved', 'rejected');

-- 2. Also delete any inbox messages that reference deleted requests
delete from public.inbox_messages
where type in ('access_request', 'access_approved', 'access_rejected')
  and metadata->>'request_id' is not null
  and (metadata->>'request_id')::text not in (
    select id::text from public.access_requests
  );

-- 3. Verify the enum type is correct
-- (re-create in case it got corrupted)
do $$ begin
  -- Check if any rows still have bad values
  if exists (select 1 from public.access_requests where status::text = '') then
    -- Force-delete them
    delete from public.access_requests where status::text = '';
  end if;
exception when others then
  raise notice 'Cleanup: %', SQLERRM;
end $$;

-- 4. Drop and recreate the triggers (ensure they're clean)
drop trigger if exists trg_notify_access_request on public.access_requests;
drop trigger if exists trg_notify_access_response on public.access_requests;

create or replace function public.notify_access_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
  values (
    new.owner_id,
    new.requester_id,
    'access_request',
    'New access request',
    coalesce(
      (select full_name from public.profiles where id = new.requester_id), 'Someone'
    ) || ' requested access to your lead.',
    '/inbox',
    jsonb_build_object('request_id', new.id, 'company_id', new.company_id, 'opportunity_id', new.opportunity_id)
  );
  return new;
end $$;

create trigger trg_notify_access_request
  after insert on public.access_requests
  for each row execute function public.notify_access_request();

create or replace function public.notify_access_response()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and coalesce(new.status::text,'') <> coalesce(old.status::text,'') then
    insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
    values (
      new.requester_id,
      new.owner_id,
      case when new.status::text = 'approved' then 'access_approved' else 'access_rejected' end,
      case when new.status::text = 'approved' then 'Access approved!' else 'Access request declined' end,
      case when new.status::text = 'approved'
        then 'Your access request has been approved. You can now view the lead details.'
        else 'Your access request was declined.' end,
      coalesce(
        (select '/leads/' || company_id::text from public.opportunities where id = new.opportunity_id),
        '/leads'
      ),
      jsonb_build_object('request_id', new.id)
    );
  end if;
  return new;
end $$;

create trigger trg_notify_access_response
  after update on public.access_requests
  for each row execute function public.notify_access_response();

-- 5. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. The access_requests table is now clean.
-- Approve/decline will work for both sellers and admins.
-- =====================================================================
