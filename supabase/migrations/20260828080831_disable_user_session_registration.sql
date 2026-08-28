drop policy if exists "registrations_insert_own_or_admin" on public.registrations;
drop policy if exists "registrations_delete_own_or_admin" on public.registrations;

create policy "registrations_insert_admin_only"
on public.registrations
for insert
to authenticated
with check ((select public.is_admin()));

create policy "registrations_delete_admin_only"
on public.registrations
for delete
to authenticated
using ((select public.is_admin()));
