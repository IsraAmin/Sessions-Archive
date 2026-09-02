create or replace function public.export_platform_backup_v1()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'format', 'sessions-archive-platform-backup',
    'version', 1,
    'created_at', now(),
    'tables', jsonb_build_object(
      'admin_activity_log', coalesce((select jsonb_agg(to_jsonb(t)) from public.admin_activity_log t), '[]'::jsonb),
      'bookmarks', coalesce((select jsonb_agg(to_jsonb(t)) from public.bookmarks t), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(to_jsonb(t)) from public.categories t), '[]'::jsonb),
      'feedback', coalesce((select jsonb_agg(to_jsonb(t)) from public.feedback t), '[]'::jsonb),
      'notification_preferences', coalesce((select jsonb_agg(to_jsonb(t)) from public.notification_preferences t), '[]'::jsonb),
      'notifications', coalesce((select jsonb_agg(to_jsonb(t)) from public.notifications t), '[]'::jsonb),
      'platform_visits', coalesce((select jsonb_agg(to_jsonb(t)) from public.platform_visits t), '[]'::jsonb),
      'profiles', coalesce((select jsonb_agg(to_jsonb(t)) from public.profiles t), '[]'::jsonb),
      'push_subscriptions', coalesce((select jsonb_agg(to_jsonb(t)) from public.push_subscriptions t), '[]'::jsonb),
      'registrations', coalesce((select jsonb_agg(to_jsonb(t)) from public.registrations t), '[]'::jsonb),
      'session_rating_stats', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_rating_stats t), '[]'::jsonb),
      'session_resources', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_resources t), '[]'::jsonb),
      'session_series', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_series t), '[]'::jsonb),
      'session_speakers', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_speakers t), '[]'::jsonb),
      'session_videos', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_videos t), '[]'::jsonb),
      'session_views', coalesce((select jsonb_agg(to_jsonb(t)) from public.session_views t), '[]'::jsonb),
      'sessions', coalesce((select jsonb_agg(to_jsonb(t)) from public.sessions t), '[]'::jsonb),
      'speakers', coalesce((select jsonb_agg(to_jsonb(t)) from public.speakers t), '[]'::jsonb),
      'user_directory', coalesce((select jsonb_agg(to_jsonb(t)) from public.user_directory t), '[]'::jsonb),
      'video_progress', coalesce((select jsonb_agg(to_jsonb(t)) from public.video_progress t), '[]'::jsonb)
    ),
    'row_counts', jsonb_build_object(
      'admin_activity_log', (select count(*) from public.admin_activity_log),
      'bookmarks', (select count(*) from public.bookmarks),
      'categories', (select count(*) from public.categories),
      'feedback', (select count(*) from public.feedback),
      'notification_preferences', (select count(*) from public.notification_preferences),
      'notifications', (select count(*) from public.notifications),
      'platform_visits', (select count(*) from public.platform_visits),
      'profiles', (select count(*) from public.profiles),
      'push_subscriptions', (select count(*) from public.push_subscriptions),
      'registrations', (select count(*) from public.registrations),
      'session_rating_stats', (select count(*) from public.session_rating_stats),
      'session_resources', (select count(*) from public.session_resources),
      'session_series', (select count(*) from public.session_series),
      'session_speakers', (select count(*) from public.session_speakers),
      'session_videos', (select count(*) from public.session_videos),
      'session_views', (select count(*) from public.session_views),
      'sessions', (select count(*) from public.sessions),
      'speakers', (select count(*) from public.speakers),
      'user_directory', (select count(*) from public.user_directory),
      'video_progress', (select count(*) from public.video_progress)
    ),
    'excluded', jsonb_build_array(
      'auth schema/passwords',
      'storage file contents',
      'push_vapid_config (server secret)',
      'push_dispatch_config (server secret)',
      'notification_push_deliveries (ephemeral queue)'
    )
  );
$$;

revoke all on function public.export_platform_backup_v1() from public;
revoke all on function public.export_platform_backup_v1() from anon;
revoke all on function public.export_platform_backup_v1() from authenticated;
grant execute on function public.export_platform_backup_v1() to service_role;

comment on function public.export_platform_backup_v1() is
  'Creates a consistent logical snapshot of Sessions Archive application data. Server secrets, Auth internals, storage files, and ephemeral delivery queue are intentionally excluded.';
