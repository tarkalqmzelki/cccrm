-- =====================================================================
-- Calista Concept — schema57.sql
-- Run AFTER schema.sql through schema56.sql.
--
-- language_translations — one row per language, holding a JSONB map
-- of key → translated string for every FIXED label used on printed
-- invoices + contracts (e.g. "SELLER", "ISSUED BY", "TOTAL DUE",
-- "Amount in words", company details, etc.).  English ('en') is the
-- built-in fallback — the app ships with English defaults in code,
-- and admins can add/edit any language (bg, de, it, …) from
-- Settings → Language Settings.
-- =====================================================================

create table if not exists public.language_translations (
  id          uuid primary key default gen_random_uuid(),
  language    text not null unique,          -- 'bg', 'de', 'it', …
  language_label text not null default '',   -- 'Български', 'Deutsch', …
  translations jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists lt_language_idx on public.language_translations(language);

alter table public.language_translations enable row level security;
drop policy if exists "lt_admin_all" on public.language_translations;
create policy "lt_admin_all" on public.language_translations for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Public read so the printed documents can resolve labels without
-- an auth session (verify page, print preview).
drop policy if exists "lt_public_read" on public.language_translations;
create policy "lt_public_read" on public.language_translations for select
  using (true);

NOTIFY pgrst, 'reload schema';
