drop trigger if exists notify_new_series_content on public.session_series;

create or replace function private.notify_new_published_content()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
  end if;

  return new;
end;
$function$;

-- Old series announcements should no longer be visible to regular users.
delete from public.notifications where type = 'series_added';
