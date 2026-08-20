-- =====================================================================
-- Calista Concept — schema54.sql
-- Run AFTER schema.sql through schema53.sql.
--
-- contract_template_variants — multi-language versions of a contract
-- template.  Each variant has a language code (e.g. 'en', 'it', 'fr',
-- 'bg') and its own body + custom_placeholders, so the admin can
-- write the same contract in multiple languages and pick one when
-- generating a contract.
-- =====================================================================

create table if not exists public.contract_template_variants (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  language    text not null,                           -- 'en', 'it', 'fr', 'bg', …
  language_label text not null default '',             -- 'English', 'Italiano', …
  body        text not null default '',               -- markdown with {placeholders}
  custom_placeholders jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (template_id, language)
);

create index if not exists ctv_template_idx on public.contract_template_variants(template_id);

alter table public.contract_template_variants enable row level security;
drop policy if exists "ctv_admin_all" on public.contract_template_variants;
create policy "ctv_admin_all" on public.contract_template_variants for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

NOTIFY pgrst, 'reload schema';
