-- =====================================================================
-- Calista Concept — schema27.sql
-- Run AFTER schema.sql through schema26.sql.
--
-- Adds `visible_on_calendar` to scheduled_activities so admins can hide
-- their own meetings from the shared calendar view. Default true so all
-- existing activities remain visible.
-- =====================================================================

alter table public.scheduled_activities
  add column if not exists visible_on_calendar boolean not null default true;

-- Add an index for the common calendar query (visible + scheduled window)
create index if not exists sa_visible_idx on public.scheduled_activities(visible_on_calendar);

NOTIFY pgrst, 'reload schema';