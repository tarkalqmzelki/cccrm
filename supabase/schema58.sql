-- =====================================================================
-- Calista Concept — schema58.sql
-- Run AFTER schema.sql through schema57.sql.
--
-- platform_locales — UI translations for the PLATFORM itself (nav,
-- buttons, labels, toasts — nothing to do with invoice/contract
-- document translations, which live in language_translations).
-- One row per locale, JSONB map of key → translated string.
-- Per-user: each user picks their locale in Profile Settings; it's
-- stored in their profile row, not globally.
-- =====================================================================

create table if not exists public.platform_locales (
  id          uuid primary key default gen_random_uuid(),
  locale      text not null unique,          -- 'en', 'bg', 'de', …
  label       text not null default '',      -- 'English', 'Български', …
  strings     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pl_locale_idx on public.platform_locales(locale);

alter table public.platform_locales enable row level security;
-- Anyone authenticated can read (needed to render the UI in the
-- user's chosen locale); only admins can edit.
drop policy if exists "pl_read" on public.platform_locales;
drop policy if exists "pl_admin_all" on public.platform_locales;
create policy "pl_read" on public.platform_locales for select
  using (true);
create policy "pl_admin_all" on public.platform_locales for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Per-user locale preference on profiles
alter table public.profiles
  add column if not exists locale text not null default 'en';

NOTIFY pgrst, 'reload schema';
