-- =====================================================================
-- Calista Concept — schema17.sql
-- Run AFTER schema.sql through schema16.sql.
--
-- Fixes: "column type is of type inbox_type but expression is of type text"
-- The trigger functions use string literals for inbox_type enum columns
-- but Postgres doesn't auto-cast them. Add explicit ::inbox_type casts.
-- =====================================================================

create or replace function public.notify_access_request()
returns trigger language plpgsql security definer as $$
begin
  insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
  values (
    new.owner_id,
    new.requester_id,
    'access_request'::inbox_type,
    'New access request',
    coalesce(
      (select full_name from public.profiles where id = new.requester_id), 'Someone'
    ) || ' requested access to your lead.',
    '/inbox',
    jsonb_build_object('request_id', new.id, 'company_id', new.company_id, 'opportunity_id', new.opportunity_id)
  );
  return new;
end $$;

create or replace function public.notify_access_response()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and coalesce(new.status::text,'') <> coalesce(old.status::text,'') then
    insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
    values (
      new.requester_id,
      new.owner_id,
      (case when new.status::text = 'approved' then 'access_approved' else 'access_rejected' end)::inbox_type,
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

create or replace function public.notify_note_comment()
returns trigger language plpgsql security definer as $$
declare
  v_note_author uuid;
  v_commenter_name text;
begin
  select author_id into v_note_author from public.company_notes where id = new.parent_id;
  if v_note_author is not null and v_note_author <> new.author_id then
    select full_name into v_commenter_name from public.profiles where id = new.author_id;
    insert into public.inbox_messages (recipient_id, sender_id, type, title, body, action_url, metadata)
    values (
      v_note_author, new.author_id,
      'note_reply'::inbox_type,
      coalesce(v_commenter_name, 'Someone') || ' replied to your note',
      new.body,
      '',
      jsonb_build_object('comment_id', new.id, 'note_id', new.parent_id)
    );
  end if;
  return new;
end $$;

-- Reattach triggers
drop trigger if exists trg_notify_access_request on public.access_requests;
create trigger trg_notify_access_request
  after insert on public.access_requests
  for each row execute function public.notify_access_request();

drop trigger if exists trg_notify_access_response on public.access_requests;
create trigger trg_notify_access_response
  after update on public.access_requests
  for each row execute function public.notify_access_response();

drop trigger if exists trg_notify_note_comment on public.note_comments;
create trigger trg_notify_note_comment
  after insert on public.note_comments
  for each row execute function public.notify_note_comment();

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. All inbox_type casts are now explicit.
-- =====================================================================
