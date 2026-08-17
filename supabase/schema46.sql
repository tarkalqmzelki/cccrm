-- =====================================================================
-- Calista Concept — schema46.sql
-- Run AFTER schema.sql through schema45.sql.
--
-- Admin Documentation — internal knowledge base for platform operators.
-- Stores entries as markdown so pasted text + code blocks render
-- correctly.  Categories are user-defined (free-form text column) and
-- surfaced by distinct values for the dropdown.  Tags are an array.
-- =====================================================================

create table if not exists public.admin_docs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,
  body        text not null default '',         -- markdown source
  category    text not null default 'General', -- user-defined (Auth, Notifications, Functionalities, …)
  tags        text[] not null default '{}',    -- array of tag strings
  created_by  uuid references public.profiles(id) on delete set null
);

create index if not exists admin_docs_category_idx on public.admin_docs(category);
create index if not exists admin_docs_title_idx on public.admin_docs(title);
create index if not exists admin_docs_updated_idx on public.admin_docs(updated_at desc);

alter table public.admin_docs enable row level security;
-- Admin-only: write/read/delete.  No anonymous or authenticated
-- (non-admin) access — this is internal ops documentation.
drop policy if exists "ad_admin_all" on public.admin_docs;
create policy "ad_admin_all" on public.admin_docs for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

NOTIFY pgrst, 'reload schema';
