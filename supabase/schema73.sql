-- =====================================================================
-- Calista Concept — schema73.sql
-- Run AFTER schema72.sql.
--
-- NEW ARRIVALS — marketplace_leads.published_at tracks when a lead
-- actually became visible (not import time), so the "new since your
-- last visit" badge reflects real publishing events.
-- =====================================================================

alter table public.marketplace_leads
  add column if not exists published_at timestamptz;

-- Backfill: currently-visible leads keep their last-touch timestamp
update public.marketplace_leads
  set published_at = coalesce(updated_at, now())
where published = true and published_at is null;

create or replace function public.tr_marketplace_published_at()
returns trigger language plpgsql as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_marketplace_published_at on public.marketplace_leads;
create trigger trg_marketplace_published_at
  before insert or update on public.marketplace_leads
  for each row execute function public.tr_marketplace_published_at();

create index if not exists ml_published_at_idx on public.marketplace_leads(published_at);

NOTIFY pgrst, 'reload schema';