drop policy if exists "authenticated create allowed notifications" on public.notifications;

create policy "users create own reminders"
on public.notifications
for insert
to authenticated
with check (
  ((select auth.uid()) = user_id)
  and type = 'session_reminder'
);

create or replace function private.notify_new_published_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    return new;
  end if;

  if tg_table_name = 'sessions' then
    if (tg_op = 'INSERT' and new.status = 'published')
       or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'published') then
      insert into public.notifications (
        user_id, type, title_ar, title_en, body_ar, body_en, href, dedupe_key
      )
      select
        p.id,
        'session_added',
        'سيشن جديدة',
        'New session',
        format('تمت إضافة سيشن جديدة: %s. اضغطي لعرض التفاصيل.', new.title),
        format('A new session was added: %s. Open it to view the details.', new.title),
        '/sessions/' || new.id::text,
        'session-added:' || new.id::text
      from public.profiles p
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    return new;
  end if;

  if tg_table_name = 'session_series' then
    if (tg_op = 'INSERT' and new.published = true)
       or (tg_op = 'UPDATE' and old.published is distinct from new.published and new.published = true) then
      insert into public.notifications (
        user_id, type, title_ar, title_en, body_ar, body_en, href, dedupe_key
      )
      select
        p.id,
        'series_added',
        'سلسلة جديدة',
        'New series',
        format('تمت إضافة سلسلة جديدة: %s. افتحي السيشنات لاستكشافها.', new.title),
        format('A new series was added: %s. Open the sessions page to explore it.', new.title),
        '/',
        'series-added:' || new.id::text
      from public.profiles p
      on conflict (user_id, dedupe_key) do nothing;
    end if;
    return new;
  end if;

  return new;
end;
$$;
