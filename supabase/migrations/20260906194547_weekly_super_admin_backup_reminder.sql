alter table public.notifications
  drop constraint if exists notifications_type_check;

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
    'series_added'::text,
    'backup_reminder'::text
  ]));

create or replace function private.create_weekly_backup_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_key text := to_char(timezone('Asia/Riyadh', now()), 'IYYY-IW');
  inserted_count integer := 0;
begin
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
    directory.id,
    'backup_reminder',
    'تذكير أسبوعي بالنسخة الاحتياطية',
    'Weekly backup reminder',
    'حان وقت تنزيل نسخة احتياطية من بيانات المنصة وحفظها على جهازك.',
    'It is time to download a backup of the platform data and save it to your device.',
    '/admin#backup-restore',
    'weekly-backup:' || week_key
  from public.user_directory as directory
  where directory.super_admin = true
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.create_weekly_backup_reminders() from public;
revoke all on function private.create_weekly_backup_reminders() from anon;
revoke all on function private.create_weekly_backup_reminders() from authenticated;

select cron.schedule(
  'sessions-archive-weekly-backup-reminder',
  '0 6 * * 0',
  $$select private.create_weekly_backup_reminders();$$
);
