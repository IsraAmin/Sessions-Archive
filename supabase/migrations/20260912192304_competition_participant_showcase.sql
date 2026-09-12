alter table public.competition_details
  add column if not exists showcase_published boolean default false,
  add column if not exists showcase_published_at timestamptz;

create table if not exists public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  winner_id uuid references public.competition_winners(id) on delete set null,
  team_name text not null check (char_length(btrim(team_name)) between 1 and 180),
  leader_name text,
  members text,
  work_title text not null check (char_length(btrim(work_title)) between 1 and 220),
  work_type text,
  track text,
  description text,
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_entry_links (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.competition_entries(id) on delete cascade,
  label text,
  link_url text not null check (char_length(btrim(link_url)) between 1 and 2000),
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now()
);

create index if not exists competition_entries_event_id_idx on public.competition_entries(event_id, position, created_at);
create index if not exists competition_entries_winner_id_idx on public.competition_entries(winner_id) where winner_id is not null;
create index if not exists competition_entry_links_entry_id_idx on public.competition_entry_links(entry_id, position, created_at);

alter table public.competition_entries enable row level security;
alter table public.competition_entry_links enable row level security;

revoke all on table public.competition_entries from anon, authenticated;
revoke all on table public.competition_entry_links from anon, authenticated;
grant select on table public.competition_entries, public.competition_entry_links to anon;
grant select, insert, update, delete on table public.competition_entries, public.competition_entry_links to authenticated;
grant select, insert, update, delete on table public.competition_entries, public.competition_entry_links to service_role;

create policy competition_entries_read_showcase_or_admin on public.competition_entries
for select to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.events e
    join public.competition_details d on d.event_id = e.id
    where e.id = competition_entries.event_id
      and e.status = 'published'
      and coalesce(d.showcase_published, false) = true
      and d.results_published = true
  )
);
create policy competition_entries_admin_insert on public.competition_entries for insert to authenticated with check (public.is_admin());
create policy competition_entries_admin_update on public.competition_entries for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy competition_entries_admin_delete on public.competition_entries for delete to authenticated using (public.is_admin());

create policy competition_entry_links_read_showcase_or_admin on public.competition_entry_links
for select to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.competition_entries ce
    join public.events e on e.id = ce.event_id
    join public.competition_details d on d.event_id = ce.event_id
    where ce.id = competition_entry_links.entry_id
      and e.status = 'published'
      and coalesce(d.showcase_published, false) = true
      and d.results_published = true
  )
);
create policy competition_entry_links_admin_insert on public.competition_entry_links for insert to authenticated with check (public.is_admin());
create policy competition_entry_links_admin_update on public.competition_entry_links for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy competition_entry_links_admin_delete on public.competition_entry_links for delete to authenticated using (public.is_admin());

create or replace function public.export_platform_backup_v1()
returns jsonb
language sql
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select jsonb_build_object(
    'format', 'sessions-archive-platform-backup',
    'version', 1,
    'created_at', now(),
    'tables', jsonb_build_object(
      'admin_activity_log', coalesce((select jsonb_agg(to_jsonb(t)) from public.admin_activity_log t), '[]'::jsonb),
      'bookmarks', coalesce((select jsonb_agg(to_jsonb(t)) from public.bookmarks t), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(to_jsonb(t)) from public.categories t), '[]'::jsonb),
      'competition_details', coalesce((select jsonb_agg(to_jsonb(t)) from public.competition_details t), '[]'::jsonb),
      'competition_entries', coalesce((select jsonb_agg(to_jsonb(t)) from public.competition_entries t), '[]'::jsonb),
      'competition_entry_links', coalesce((select jsonb_agg(to_jsonb(t)) from public.competition_entry_links t), '[]'::jsonb),
      'competition_stages', coalesce((select jsonb_agg(to_jsonb(t)) from public.competition_stages t), '[]'::jsonb),
      'competition_winners', coalesce((select jsonb_agg(to_jsonb(t)) from public.competition_winners t), '[]'::jsonb),
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
      'competition_details', (select count(*) from public.competition_details),
      'competition_entries', (select count(*) from public.competition_entries),
      'competition_entry_links', (select count(*) from public.competition_entry_links),
      'competition_stages', (select count(*) from public.competition_stages),
      'competition_winners', (select count(*) from public.competition_winners),
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

create or replace function public.restore_platform_backup_v1(backup_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  required_table text;
  trigger_table text;
  has_events boolean := (backup_data->'tables' ? 'events') and (backup_data->'tables' ? 'event_media');
  has_competition_details boolean := backup_data->'tables' ? 'competition_details';
  has_competition_stages boolean := backup_data->'tables' ? 'competition_stages';
  has_competition_winners boolean := backup_data->'tables' ? 'competition_winners';
  has_competitions boolean := has_competition_details and has_competition_stages and has_competition_winners;
  has_competition_entries boolean := backup_data->'tables' ? 'competition_entries';
  has_competition_entry_links boolean := backup_data->'tables' ? 'competition_entry_links';
  has_competition_showcase boolean := has_competition_entries and has_competition_entry_links;
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

  if (has_competition_details or has_competition_stages or has_competition_winners) and not has_competitions then
    raise exception 'Backup contains incomplete competition tables' using errcode = '22023';
  end if;
  if (has_competition_entries or has_competition_entry_links) and not has_competition_showcase then
    raise exception 'Backup contains incomplete competition showcase tables' using errcode = '22023';
  end if;

  foreach trigger_table in array trigger_tables loop
    execute format('alter table public.%I disable trigger user', trigger_table);
  end loop;

  if has_events then
    truncate table public.competition_entry_links, public.competition_entries, public.competition_winners, public.competition_stages, public.competition_details, public.event_media, public.events;
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
    if has_competitions then
      if jsonb_typeof(backup_data->'tables'->'competition_details') <> 'array'
         or jsonb_typeof(backup_data->'tables'->'competition_stages') <> 'array'
         or jsonb_typeof(backup_data->'tables'->'competition_winners') <> 'array' then
        raise exception 'Backup contains invalid competition tables' using errcode = '22023';
      end if;
      insert into public.competition_details select * from jsonb_populate_recordset(null::public.competition_details, backup_data->'tables'->'competition_details');
      insert into public.competition_stages select * from jsonb_populate_recordset(null::public.competition_stages, backup_data->'tables'->'competition_stages');
      insert into public.competition_winners select * from jsonb_populate_recordset(null::public.competition_winners, backup_data->'tables'->'competition_winners');
      if has_competition_showcase then
        if jsonb_typeof(backup_data->'tables'->'competition_entries') <> 'array'
           or jsonb_typeof(backup_data->'tables'->'competition_entry_links') <> 'array' then
          raise exception 'Backup contains invalid competition showcase tables' using errcode = '22023';
        end if;
        insert into public.competition_entries select * from jsonb_populate_recordset(null::public.competition_entries, backup_data->'tables'->'competition_entries');
        insert into public.competition_entry_links select * from jsonb_populate_recordset(null::public.competition_entry_links, backup_data->'tables'->'competition_entry_links');
      end if;
    end if;
    insert into public.event_media select * from jsonb_populate_recordset(null::public.event_media, backup_data->'tables'->'event_media');
  end if;

  foreach trigger_table in array trigger_tables loop
    execute format('alter table public.%I enable trigger user', trigger_table);
  end loop;

  if exists (select 1 from public.platform_visits) then
    perform setval(pg_get_serial_sequence('public.platform_visits', 'id'), (select max(id) from public.platform_visits), true);
  end if;

  return jsonb_build_object('ok', true, 'version', 1, 'events_restored', has_events, 'competitions_restored', has_competitions, 'competition_showcase_restored', has_competition_showcase);
end;
$$;
