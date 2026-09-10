insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  20971520,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin_images_select" on storage.objects;
drop policy if exists "admin_images_insert" on storage.objects;
drop policy if exists "admin_images_update" on storage.objects;
drop policy if exists "admin_images_delete" on storage.objects;

create policy "admin_images_select" on storage.objects
for select to authenticated
using (
  bucket_id = any (array['session-covers'::text, 'speaker-images'::text, 'event-covers'::text])
  and public.is_admin()
);

create policy "admin_images_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = any (array['session-covers'::text, 'speaker-images'::text, 'event-covers'::text])
  and public.is_admin()
);

create policy "admin_images_update" on storage.objects
for update to authenticated
using (
  bucket_id = any (array['session-covers'::text, 'speaker-images'::text, 'event-covers'::text])
  and public.is_admin()
)
with check (
  bucket_id = any (array['session-covers'::text, 'speaker-images'::text, 'event-covers'::text])
  and public.is_admin()
);

create policy "admin_images_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = any (array['session-covers'::text, 'speaker-images'::text, 'event-covers'::text])
  and public.is_admin()
);
