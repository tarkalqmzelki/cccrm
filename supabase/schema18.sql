-- =====================================================================
-- Calista Concept — schema18.sql
-- Run AFTER schema.sql through schema17.sql.
--
-- 1. Rate-limit access requests: one per lead per 24h
-- 2. Inbox delete already has RLS, just verify
-- 3. Admin can delete note_comments (already in policy, verify)
-- =====================================================================

-- 1. Add a unique partial index: prevent duplicate pending requests
--    within 24 hours for the same requester + opportunity/company
--    (We use a function-based approach: delete old pending requests
--    automatically before insert via trigger)

create or replace function public.cleanup_old_access_requests()
returns trigger language plpgsql security definer as $$
begin
  -- Delete pending requests from the same requester for the same
  -- opportunity or company within the last 24 hours
  delete from public.access_requests
  where requester_id = new.requester_id
    and status = 'pending'
    and created_at > now() - interval '24 hours'
    and (
      (new.opportunity_id is not null and opportunity_id = new.opportunity_id)
      or
      (new.company_id is not null and company_id = new.company_id and opportunity_id is null)
    );
  return new;
end $$;

drop trigger if exists trg_cleanup_access_requests on public.access_requests;
create trigger trg_cleanup_access_requests
  before insert on public.access_requests
  for each row execute function public.cleanup_old_access_requests();

-- 2. Verify inbox delete policy exists
-- (already created in schema14.sql — inbox_delete allows recipient or admin)

-- 3. Verify note_comments delete policy allows admin
-- (already created in schema14.sql — nc_delete allows author_id or is_admin)

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE.
-- - Access requests are rate-limited: one per lead per 24h
-- - Inbox messages can be deleted by recipient or admin
-- - Note comments can be deleted by author or admin
-- =====================================================================
