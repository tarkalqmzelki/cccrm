-- =====================================================================
-- Calista Concept — schema71.sql
-- Run AFTER schema70.sql.
--
-- THE REAL FIX for:  22P02 invalid input value for enum deal_status: ""
--
-- schema70 fixed sync_deal_payout(), but a SECOND plan-time landmine
-- existed: notify_admin_deal_review() (schema48) — a trigger that fires
-- on EVERY status update of deals — used
--     coalesce(old.status, '') <> 'pending_review'
-- Postgres coerces the '' literal into the deal_status enum while
-- planning the statement, so approve/reject/close ALWAYS failed.
--
-- This recreates the function with a text-safe comparison.
-- Safe to run multiple times.
-- =====================================================================

create or replace function public.notify_admin_deal_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin record;
  actor_id uuid;
  actor_name text;
begin
  if TG_OP != 'UPDATE' then
    return new;
  end if;
  -- Only fire when status moves INTO pending_review (was something else).
  -- Compare as TEXT — never let '' touch the deal_status enum.
  if new.status::text = 'pending_review' and old.status::text is distinct from 'pending_review' then
    actor_id := coalesce(auth.uid(), new.seller_id);
    select full_name into actor_name from public.profiles where id = actor_id;

    for admin in
      select id from public.profiles
        where role = 'admin' and active = true
        and id is distinct from actor_id
    loop
      insert into public.inbox_messages (
        recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
      ) values (
        admin.id,
        actor_id,
        'system',
        'Deal needs review',
        coalesce(new.company, 'Untitled') || ' is now pending review.',
        '/deals/' || new.id,
        jsonb_build_object(
          'kind', 'deal_review',
          'deal_id', new.id,
          'actor_id', actor_id,
          'actor_name', coalesce(actor_name, 'Someone')
        ),
        'admin_deal_review'
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_admin_deal_review on public.deals;
create trigger trg_notify_admin_deal_review
  after update of status on public.deals
  for each row execute function public.notify_admin_deal_review();

-- Belt & suspenders: make sure the other two known landmines are the
-- text-safe versions (schema70's sync_deal_payout + notify_deal_approved
-- was already safe, but re-assert the guard pattern used everywhere).
alter table public.deals enable row level security;

NOTIFY pgrst, 'reload schema';
