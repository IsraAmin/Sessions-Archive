-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-images', 'profile-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('session-covers', 'session-covers', true, 8388608, array['image/jpeg','image/png','image/webp']),
  ('speaker-images', 'speaker-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('session-resources', 'session-resources', false, 26214400, null)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Profile images: path must begin with the authenticated user id.
create policy "profile_images_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile_images_select_own" on storage.objects for select to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile_images_update_own" on storage.objects for update to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile_images_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Admin-managed public image buckets.
create policy "admin_images_insert" on storage.objects for insert to authenticated
with check (bucket_id in ('session-covers','speaker-images') and public.is_admin());
create policy "admin_images_select" on storage.objects for select to authenticated
using (bucket_id in ('session-covers','speaker-images') and public.is_admin());
create policy "admin_images_update" on storage.objects for update to authenticated
using (bucket_id in ('session-covers','speaker-images') and public.is_admin())
with check (bucket_id in ('session-covers','speaker-images') and public.is_admin());
create policy "admin_images_delete" on storage.objects for delete to authenticated
using (bucket_id in ('session-covers','speaker-images') and public.is_admin());

-- Session resources are private; first folder must be the session UUID.
create policy "session_resources_storage_read" on storage.objects for select to authenticated
using (
  bucket_id = 'session-resources'
  and exists (
    select 1 from public.sessions s
    where s.id::text = (storage.foldername(name))[1]
      and (s.status = 'published' or public.is_admin())
  )
);
create policy "session_resources_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'session-resources' and public.is_admin());
create policy "session_resources_storage_update" on storage.objects for update to authenticated
using (bucket_id = 'session-resources' and public.is_admin())
with check (bucket_id = 'session-resources' and public.is_admin());
create policy "session_resources_storage_delete" on storage.objects for delete to authenticated
using (bucket_id = 'session-resources' and public.is_admin());
