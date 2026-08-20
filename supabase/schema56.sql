-- =====================================================================
-- Calista Concept — schema56.sql
-- Run AFTER schema.sql through schema55.sql.
--
-- design_settings — singleton table for platform-wide visual / branding
-- settings (logo URLs per theme, future design tokens).  Separate from
-- invoice_settings so the admin's brand identity is owned at the
-- platform level, not tangled with invoice-specific templates.
-- =====================================================================

create table if not exists public.design_settings (
  id              int primary key default 1,
  logo_url_light  text not null default '',   -- shown in light mode
  logo_url_dark   text not null default '',   -- shown in dark mode
  updated_at      timestamptz not null default now(),
  constraint design_settings_singleton check (id = 1)
);

insert into public.design_settings (id)
select 1
where not exists (select 1 from public.design_settings);

alter table public.design_settings enable row level security;
drop policy if exists "ds_admin_all" on public.design_settings;
create policy "ds_admin_all" on public.design_settings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Anonymous read so the Logo component can fetch the right logo URL
-- without an auth session (e.g. login page, verify page).
drop policy if exists "ds_public_read" on public.design_settings;
create policy "ds_public_read" on public.design_settings for select
  using (true);

NOTIFY pgrst, 'reload schema';
