-- =====================================================================
-- Calista Concept — schema66.sql
-- Run AFTER schema65.sql.
--
-- TEAM BONUS SPLIT — how a team quest's financial bonus is distributed:
--   'full'         every active member receives the full bonus
--   'equal'        the bonus is a POOL split equally between members
--   'contribution' the pool is split proportionally to each member's
--                  contribution toward the goal metric
-- =====================================================================

alter table public.challenges
  add column if not exists bonus_split text not null default 'full';

update public.challenges set bonus_split = 'full' where bonus_split is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'challenges_bonus_split_check'
  ) then
    alter table public.challenges
      add constraint challenges_bonus_split_check check (bonus_split in ('full', 'equal', 'contribution'));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
