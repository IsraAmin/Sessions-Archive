drop policy if exists user_directory_super_admin_select on public.user_directory;
drop policy if exists user_directory_admin_select on public.user_directory;

create policy user_directory_admin_select
on public.user_directory
for select
to authenticated
using ((select public.is_admin()));
