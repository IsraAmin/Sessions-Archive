create or replace function public.restore_platform_backup_v1(backup_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  required_table text;
  trigger_table text;
  required_tables constant text[] := array[
    'admin_activity_log','bookmarks','categories','feedback','notification_preferences',
    'notifications','platform_visits','profiles','push_subscriptions','registrations',
    'session_rating_stats','session_resources','session_series','session_speakers',
    'session_videos','session_views','sessions','speakers','user_directory','video_progress'
  ];
  trigger_tables constant text[] := array[
    'bookmarks','categories','feedback','notification_preferences','notifications','profiles',
    'push_subscriptions','registrations','session_resources','session_series','session_videos',
    'sessions','speakers'
  ];
begin
  if backup_data is null
     or backup_data->>'format' <> 'sessions-archive-platform-backup'
     or coalesce((backup_data->>'version')::integer, 0) <> 1
     or jsonb_typeof(backup_data->'tables') <> 'object' then
    raise exception 'Invalid Sessions Archive backup file' using errcode = '22023';
  end if;

  foreach required_table in array required_tables loop
    if not (backup_data->'tables' ? required_table)
       or jsonb_typeof(backup_data->'tables'->required_table) <> 'array' then
      raise exception 'Backup is missing required table: %', required_table using errcode = '22023';
    end if;
  end loop;

  foreach trigger_table in array trigger_tables loop
    execute format('alter table public.%I disable trigger user', trigger_table);
  end loop;

  truncate table
    public.notification_push_deliveries,
    public.video_progress,
    public.session_views,
    public.session_rating_stats,
    public.feedback,
    public.bookmarks,
    public.registrations,
    public.push_subscriptions,
    public.notification_preferences,
    public.notifications,
    public.session_resources,
    public.session_videos,
    public.session_speakers,
    public.sessions,
    public.session_series,
    public.speakers,
    public.categories,
    public.platform_visits,
    public.admin_activity_log,
    public.profiles,
    public.user_directory
  restart identity;

  insert into public.categories select * from jsonb_populate_recordset(null::public.categories, backup_data->'tables'->'categories');
  insert into public.speakers select * from jsonb_populate_recordset(null::public.speakers, backup_data->'tables'->'speakers');
  insert into public.session_series select * from jsonb_populate_recordset(null::public.session_series, backup_data->'tables'->'session_series');
  insert into public.sessions select * from jsonb_populate_recordset(null::public.sessions, backup_data->'tables'->'sessions');
  insert into public.session_speakers select * from jsonb_populate_recordset(null::public.session_speakers, backup_data->'tables'->'session_speakers');
  insert into public.session_videos select * from jsonb_populate_recordset(null::public.session_videos, backup_data->'tables'->'session_videos');
  insert into public.session_resources select * from jsonb_populate_recordset(null::public.session_resources, backup_data->'tables'->'session_resources');
  insert into public.profiles select * from jsonb_populate_recordset(null::public.profiles, backup_data->'tables'->'profiles');
  insert into public.user_directory select * from jsonb_populate_recordset(null::public.user_directory, backup_data->'tables'->'user_directory');
  insert into public.registrations select * from jsonb_populate_recordset(null::public.registrations, backup_data->'tables'->'registrations');
  insert into public.bookmarks select * from jsonb_populate_recordset(null::public.bookmarks, backup_data->'tables'->'bookmarks');
  insert into public.feedback select * from jsonb_populate_recordset(null::public.feedback, backup_data->'tables'->'feedback');
  insert into public.session_rating_stats select * from jsonb_populate_recordset(null::public.session_rating_stats, backup_data->'tables'->'session_rating_stats');
  insert into public.session_views select * from jsonb_populate_recordset(null::public.session_views, backup_data->'tables'->'session_views');
  insert into public.video_progress select * from jsonb_populate_recordset(null::public.video_progress, backup_data->'tables'->'video_progress');
  insert into public.notification_preferences select * from jsonb_populate_recordset(null::public.notification_preferences, backup_data->'tables'->'notification_preferences');
  insert into public.notifications select * from jsonb_populate_recordset(null::public.notifications, backup_data->'tables'->'notifications');
  insert into public.push_subscriptions select * from jsonb_populate_recordset(null::public.push_subscriptions, backup_data->'tables'->'push_subscriptions');
  insert into public.platform_visits overriding system value select * from jsonb_populate_recordset(null::public.platform_visits, backup_data->'tables'->'platform_visits');
  insert into public.admin_activity_log select * from jsonb_populate_recordset(null::public.admin_activity_log, backup_data->'tables'->'admin_activity_log');

  foreach trigger_table in array trigger_tables loop
    execute format('alter table public.%I enable trigger user', trigger_table);
  end loop;

  if exists (select 1 from public.platform_visits) then
    perform setval(pg_get_serial_sequence('public.platform_visits', 'id'), (select max(id) from public.platform_visits), true);
  end if;

  return jsonb_build_object('ok', true, 'version', 1);
end;
$$;

revoke all on function public.restore_platform_backup_v1(jsonb) from public;
revoke all on function public.restore_platform_backup_v1(jsonb) from anon;
revoke all on function public.restore_platform_backup_v1(jsonb) from authenticated;
grant execute on function public.restore_platform_backup_v1(jsonb) to service_role;
