-- Supabase Storage for blog images — run in Supabase Dashboard → SQL Editor → Run
-- Safe to re-run

-- Create public bucket for blog images
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do update set public = true;

-- Allow public read (anyone can view images)
drop policy if exists "Public read blog-images" on storage.objects;
create policy "Public read blog-images"
on storage.objects for select
using (bucket_id = 'blog-images');

-- Allow authenticated (service_role) to insert/update/delete — admin upload via service_role key bypasses RLS anyway
-- But also allow anon insert for local dev if needed? No — only service_role should write.
drop policy if exists "Service can upload blog-images" on storage.objects;
create policy "Service can upload blog-images"
on storage.objects for insert
with check (bucket_id = 'blog-images');

drop policy if exists "Service can update blog-images" on storage.objects;
create policy "Service can update blog-images"
on storage.objects for update
using (bucket_id = 'blog-images');

drop policy if exists "Service can delete blog-images" on storage.objects;
create policy "Service can delete blog-images"
on storage.objects for delete
using (bucket_id = 'blog-images');
