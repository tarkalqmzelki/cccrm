-- =====================================================================
-- Calista Concept — schema47.sql
-- Run AFTER schema.sql through schema46.sql.
--
-- 1. admin_doc_snippets — code snippets attached to an Admin Doc entry.
--    Each snippet has a title, a language hint (for syntax styling) and
--    the raw code body.  One doc → many snippets.
-- 2. admin_docs.structure — long-form markdown text where the admin can
--    describe HOW a function/update was built (the "Structure View").
-- 3. New notification keys: 'user_whats_new' (sent to every active user
--    when an admin publishes a new changelog entry) and 'user_broadcast'
--    (sent to every active user when an admin manually triggers a
--    broadcast).  Both flow through the existing inbox_messages →
--    webhook → Edge Function push pipeline.
-- 4. Trigger on changelog: when an entry is INSERTed with published=true
--    (or UPDATEd to published=true) fan-out an inbox_messages row to
--    every active user with notification_key='user_whats_new' so the
--    existing push pipeline delivers a "What's new" push to every
--    subscribed device.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. admin_doc_snippets
-- ---------------------------------------------------------------------
create table if not exists public.admin_doc_snippets (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.admin_docs(id) on delete cascade,
  title       text not null default '',
  language    text not null default '',        -- 'ts' | 'tsx' | 'sql' | 'json' | 'css' | '' for plain
  code        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null
);

create index if not exists admin_doc_snippets_doc_idx on public.admin_doc_snippets(doc_id);

alter table public.admin_doc_snippets enable row level security;
drop policy if exists "ads_admin_all" on public.admin_doc_snippets;
create policy "ads_admin_all" on public.admin_doc_snippets for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------
-- 2. admin_docs.structure column (long-form markdown "how was this done")
-- ---------------------------------------------------------------------
alter table public.admin_docs
  add column if not exists structure text not null default '';

-- ---------------------------------------------------------------------
-- 3. New notification keys + templates
-- ---------------------------------------------------------------------
insert into public.notification_templates (key, enabled, title_template, body_template, tone) values
  ('user_whats_new',  true, 'What''s new: {subject}', '{body}', 'normal'),
  ('user_broadcast',  true, '{subject}',              '{body}', 'high')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. Trigger — fan-out "what's new" inbox messages on changelog publish
--    The existing trg_notify_push on inbox_messages then sends the push
--    to each recipient's subscribed devices.
-- ---------------------------------------------------------------------
create or replace function public.fanout_changelog_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fan out when the row is (or just became) published.
  if new.published is distinct from true then
    return new;
  end if;

  -- On UPDATE, only fire when published flipped false → true.
  if TG_OP = 'UPDATE' and coalesce(old.published, false) = true then
    return new;
  end if;

  -- Insert one inbox_messages row per active user (dedup by metadata
  -- so re-publishing an entry doesn't spam the same users twice).
  insert into public.inbox_messages (
    recipient_id, sender_id, type, title, body, action_url, metadata, notification_key
  )
  select
    p.id,
    null,
    'system',
    'What''s new: ' || coalesce(nullif(trim(new.title), ''), 'Update'),
    coalesce(nullif(trim(new.body), ''), 'A new update has been published.'),
    '/',
    jsonb_build_object('kind', 'whats_new', 'changelog_id', new.id::text),
    'user_whats_new'
  from public.profiles p
  where p.active = true
    and not exists (
      select 1 from public.inbox_messages m
      where m.recipient_id = p.id
        and (m.metadata->>'kind') = 'whats_new'
        and (m.metadata->>'changelog_id') = new.id::text
    );

  return new;
end;
$$;

drop trigger if exists trg_changelog_push on public.changelog;
create trigger trg_changelog_push
  after insert or update of published on public.changelog
  for each row execute function public.fanout_changelog_push();

NOTIFY pgrst, 'reload schema';
