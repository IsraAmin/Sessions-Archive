drop policy if exists "users create own reminders" on public.notifications;
drop policy if exists "admins create content notifications" on public.notifications;

create policy "authenticated create allowed notifications"
on public.notifications
for insert
to authenticated
with check (
  (((select auth.uid()) = user_id) and type = 'session_reminder')
  or (public.is_admin() and type in ('session_added', 'series_added'))
);
