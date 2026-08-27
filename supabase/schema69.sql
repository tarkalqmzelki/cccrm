-- =====================================================================
-- Calista Concept — schema69.sql
-- Run AFTER schema68.sql.
--
-- TYPOGRAPHY — platform-wide custom font (schema69):
--   design_settings.font_url            uploaded font file (public URL)
--   design_settings.font_letter_spacing letter-spacing in em (default 0)
-- + a public 'design' storage bucket for the font file upload.
-- Applied globally via FontFace API; printable documents excluded.
-- =====================================================================

alter table public.design_settings
  add column if not exists font_url text not null default '',
  add column if not exists font_letter_spacing numeric not null default 0;

-- Storage bucket for the font file (public read, admin write)
insert into storage.buckets (id, name, public)
values ('design', 'design', true)
on conflict (id) do nothing;

drop policy if exists "design_bucket_read" on storage.objects;
drop policy if exists "design_bucket_admin" on storage.objects;
create policy "design_bucket_read" on storage.objects for select
  using (bucket_id = 'design');
create policy "design_bucket_admin" on storage.objects for all
  using (bucket_id = 'design' and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (bucket_id = 'design' and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

NOTIFY pgrst, 'reload schema';
