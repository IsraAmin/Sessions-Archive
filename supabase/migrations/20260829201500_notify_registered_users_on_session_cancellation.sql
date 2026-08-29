create or replace function private.notify_session_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    insert into public.notifications (
      user_id,
      type,
      title_ar,
      title_en,
      body_ar,
      body_en,
      href,
      dedupe_key
    )
    select
      r.user_id,
      'session_cancelled',
      'تم إلغاء السيشن',
      'Session cancelled',
      format('تم إلغاء سيشن «%s».', new.title),
      format('The session “%s” has been cancelled.', new.title),
      '/sessions/' || new.id::text,
      'session-cancelled:' || new.id::text
    from public.registrations r
    where r.session_id = new.id
      and r.attendance_status = 'registered'
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_session_cancelled() from public, anon, authenticated;

drop trigger if exists notify_session_cancelled_trigger on public.sessions;
create trigger notify_session_cancelled_trigger
after update of status on public.sessions
for each row execute function private.notify_session_cancelled();
