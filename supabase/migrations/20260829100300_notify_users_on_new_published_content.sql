alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'session_reminder'::text,
    'recording_added'::text,
    'resource_added'::text,
    'session_changed'::text,
    'certificate_ready'::text,
    'system'::text,
    'session_added'::text,
    'series_added'::text
  ]));

create policy "admins create content notifications"
on public.notifications
for insert
to authenticated
with check (
  public.is_admin()
  and type in ('session_added', 'series_added')
);

create or replace function private.notify_new_published_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

drop trigger if exists notify_new_session_content on public.sessions;
create trigger notify_new_session_content
after insert or update of status on public.sessions
for each row
execute function private.notify_new_published_content();

drop trigger if exists notify_new_series_content on public.session_series;
create trigger notify_new_series_content
after insert or update of published on public.session_series
for each row
execute function private.notify_new_published_content();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
