-- =====================================================================
-- Calista Concept — schema60.sql
-- Run AFTER schema59.sql.
--
-- TEAM QUESTS — challenges.scope:
--   'solo' → per-member quest (default, existing behaviour)
--   'team' → the whole company pools progress toward ONE target;
--            bonus payout is queued for every active non-admin member
--            when the pooled total reaches target_count.
-- =====================================================================

alter table public.challenges
  add column if not exists scope text not null default 'solo';

-- Backfill safety + constraint
update public.challenges set scope = 'solo' where scope is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'challenges_scope_check'
  ) then
    alter table public.challenges
      add constraint challenges_scope_check check (scope in ('solo', 'team'));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
