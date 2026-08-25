-- =====================================================================
-- Calista Concept — schema59.sql
-- Run AFTER schema.sql through schema58.sql.
--
-- CHALLENGES — admin-authored quests pushed to members.
--   type = 'functional' → auto-checked by the platform (e.g. create N
--          leads / submit N deals since the challenge went live).
--   type = 'regular'    → free-form quest, self-reported progress.
--   points              → XP reward shown on the card.
--   financial_bonus     → EUR bonus; 0 hides the bonus chip; > 0 is
--                          credited to the member's payouts as a
--                          pending 'bonus' payout on completion.
-- =====================================================================

create table if not exists public.challenges (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text not null default '',
  type             text not null default 'regular' check (type in ('functional', 'regular')),
  -- which platform action auto-checks a functional challenge:
  -- 'lead_created' | 'deal_submitted'
  functional_type  text not null default 'lead_created',
  target_count     int not null default 1,
  points           int not null default 0,
  financial_bonus  numeric not null default 0,
  status           text not null default 'active' check (status in ('active', 'ended')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists challenges_status_idx on public.challenges(status);

alter table public.challenges enable row level security;
drop policy if exists "ch_read" on public.challenges;
drop policy if exists "ch_admin_all" on public.challenges;
create policy "ch_read" on public.challenges for select using (true);
create policy "ch_admin_all" on public.challenges for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- Per-user progress. Functional progress is derived client-side from
-- companies/deals; regular challenges are self-reported here.
-- ---------------------------------------------------------------------
create table if not exists public.challenge_progress (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  progress      int not null default 0,
  completed_at  timestamptz,
  bonus_paid    boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (challenge_id, user_id)
);

alter table public.challenge_progress enable row level security;
drop policy if exists "cp_read" on public.challenge_progress;
drop policy if exists "cp_own_write" on public.challenge_progress;
drop policy if exists "cp_admin_all" on public.challenge_progress;
create policy "cp_read" on public.challenge_progress for select using (true);
create policy "cp_own_write" on public.challenge_progress for insert
  with check (user_id = auth.uid());
create policy "cp_own_update" on public.challenge_progress for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cp_admin_all" on public.challenge_progress for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Bonus payouts reuse the existing payouts table; payout_type is a free
-- text column so 'bonus' needs no constraint change.

NOTIFY pgrst, 'reload schema';
