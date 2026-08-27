create index if not exists session_series_created_by_idx on public.session_series(created_by);

drop policy if exists "admins manage series" on public.session_series;

drop policy if exists "admins insert series" on public.session_series;
create policy "admins insert series" on public.session_series for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "admins update series" on public.session_series;
create policy "admins update series" on public.session_series for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admins delete series" on public.session_series;
create policy "admins delete series" on public.session_series for delete to authenticated
using ((select public.is_admin()));
