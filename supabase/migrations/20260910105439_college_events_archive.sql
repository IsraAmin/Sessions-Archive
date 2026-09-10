create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  slug text not null unique check (char_length(slug) between 2 and 180),
  description text not null default '',
  event_type text not null default 'other' check (event_type in ('cultural','sports','initiative','social','academic','other')),
  event_date date not null,
  location text,
  drive_folder_url text,
  featured boolean not null default false,
  status text not null default 'published' check (status in ('draft','published')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  provider text not null check (provider in ('google_drive','youtube','external','whatsapp','telegram')),
  source_url text not null check (char_length(source_url) > 0),
  source_id text,
  title text,
  caption text,
  position integer not null default 1 check (position >= 1),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists events_status_date_idx on public.events(status, event_date desc);
create index if not exists events_featured_date_idx on public.events(featured desc, event_date desc);
create index if not exists event_media_event_position_idx on public.event_media(event_id, position, created_at);
create unique index if not exists event_media_one_cover_per_event_idx on public.event_media(event_id) where is_cover = true;

alter table public.events enable row level security;
alter table public.event_media enable row level security;

create policy "events_read_published_or_admin" on public.events
for select to anon, authenticated
using (status = 'published' or public.is_admin());

create policy "events_admin_insert" on public.events
for insert to authenticated
with check (public.is_admin());

create policy "events_admin_update" on public.events
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "events_admin_delete" on public.events
for delete to authenticated
using (public.is_admin());

create policy "event_media_read_published_or_admin" on public.event_media
for select to anon, authenticated
using (
  exists (
    select 1 from public.events e
    where e.id = event_media.event_id
      and (e.status = 'published' or public.is_admin())
  )
);

create policy "event_media_admin_insert" on public.event_media
for insert to authenticated
with check (public.is_admin());

create policy "event_media_admin_update" on public.event_media
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "event_media_admin_delete" on public.event_media
for delete to authenticated
using (public.is_admin());

grant select on public.events, public.event_media to anon;
grant select, insert, update, delete on public.events, public.event_media to authenticated;
grant select, insert, update, delete on public.events, public.event_media to service_role;

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
      'event_media', coalesce((select jsonb_agg(to_jsonb(t)) from public.event_media t), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(t)) from public.events t), '[]'::jsonb),
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
      'event_media', (select count(*) from public.event_media),
      'events', (select count(*) from public.events),
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

create or replace function public.restore_platform_backup_v1(backup_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  required_table text;
  trigger_table text;
  has_events boolean := (backup_data->'tables' ? 'events') and (backup_data->'tables' ? 'event_media');
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

  if has_events then
    truncate table public.event_media, public.events;
  end if;

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

  if has_events then
    if jsonb_typeof(backup_data->'tables'->'events') <> 'array' or jsonb_typeof(backup_data->'tables'->'event_media') <> 'array' then
      raise exception 'Backup contains invalid event tables' using errcode = '22023';
    end if;
    insert into public.events select * from jsonb_populate_recordset(null::public.events, backup_data->'tables'->'events');
    insert into public.event_media select * from jsonb_populate_recordset(null::public.event_media, backup_data->'tables'->'event_media');
  end if;

  foreach trigger_table in array trigger_tables loop
    execute format('alter table public.%I enable trigger user', trigger_table);
  end loop;

  if exists (select 1 from public.platform_visits) then
    perform setval(pg_get_serial_sequence('public.platform_visits', 'id'), (select max(id) from public.platform_visits), true);
  end if;

  return jsonb_build_object('ok', true, 'version', 1, 'events_restored', has_events);
end;
$$;

revoke all on function public.restore_platform_backup_v1(jsonb) from public;
revoke all on function public.restore_platform_backup_v1(jsonb) from anon;
revoke all on function public.restore_platform_backup_v1(jsonb) from authenticated;
grant execute on function public.restore_platform_backup_v1(jsonb) to service_role;