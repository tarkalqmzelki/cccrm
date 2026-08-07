-- =====================================================================
-- Calista Concept — schema15.sql
-- Run AFTER schema.sql through schema14.sql.
--
-- Cleans up any access_requests with invalid/empty status values
-- that were created by earlier broken inserts (PostgREST cannot
-- deserialize an empty string into an enum).
-- =====================================================================

delete from public.access_requests
where status::text = ''
   or status::text not in ('pending', 'approved', 'rejected');

-- Also clean up any orphaned inbox messages referencing deleted requests
delete from public.inbox_messages
where type in ('access_request', 'access_approved', 'access_rejected')
  and metadata->>'request_id' is not null
  and (metadata->>'request_id')::text not in (
    select id::text from public.access_requests
  );

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- DONE. Future access requests always use a valid enum value.
-- =====================================================================
