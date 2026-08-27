create schema if not exists private;

create table if not exists public.session_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions
  add column if not exists series_id uuid references public.session_series(id) on delete set null,
  add column if not exists series_position integer check (series_position is null or series_position >= 1);

alter table public.registrations
  add column if not exists attendance_status text not null default 'registered' check (attendance_status in ('registered','attended','no_show')),
  add column if not exists attended_at timestamptz;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('session_reminder','recording_added','resource_added','session_changed','certificate_ready','system')),
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  href text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.video_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.session_videos(id) on delete cascade,
  seconds integer not null default 0 check (seconds >= 0),
  duration integer not null default 0 check (duration >= 0),
  percent numeric(5,2) not null default 0 check (percent >= 0 and percent <= 100),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, video_id)
);

create table if not exists public.session_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at) where read_at is null;
create index if not exists video_progress_user_idx on public.video_progress(user_id, updated_at desc);
create index if not exists video_progress_video_idx on public.video_progress(video_id);
create index if not exists session_views_session_idx on public.session_views(session_id);
create index if not exists sessions_series_idx on public.sessions(series_id, series_position);
create index if not exists registrations_attendance_idx on public.registrations(session_id, attendance_status);

alter table public.session_series enable row level security;
alter table public.notifications enable row level security;
alter table public.video_progress enable row level security;
alter table public.session_views enable row level security;

drop policy if exists "series readable" on public.session_series;
create policy "series readable" on public.session_series for select to anon, authenticated
using (published or (select public.is_admin()));

drop policy if exists "admins manage series" on public.session_series;
create policy "admins manage series" on public.session_series for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications" on public.notifications for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users create own reminders" on public.notifications;
create policy "users create own reminders" on public.notifications for insert to authenticated
with check ((select auth.uid()) = user_id and type = 'session_reminder');

drop policy if exists "users read own video progress" on public.video_progress;
create policy "users read own video progress" on public.video_progress for select to authenticated
using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "users insert own video progress" on public.video_progress;
create policy "users insert own video progress" on public.video_progress for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own video progress" on public.video_progress;
create policy "users update own video progress" on public.video_progress for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own video progress" on public.video_progress;
create policy "users delete own video progress" on public.video_progress for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users read own session views" on public.session_views;
create policy "users read own session views" on public.session_views for select to authenticated
using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "users insert own session views" on public.session_views;
create policy "users insert own session views" on public.session_views for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own session views" on public.session_views;
create policy "users update own session views" on public.session_views for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on public.session_series to anon, authenticated;
grant insert, update, delete on public.session_series to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.video_progress to authenticated;
grant select, insert, update on public.session_views to authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'super_admin')::boolean, false);
$$;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function private.notify_video_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_title text;
begin
  select s.title into session_title from public.sessions s where s.id = new.session_id;
  insert into public.notifications (user_id, type, title_ar, title_en, body_ar, body_en, href, dedupe_key)
  select r.user_id,
         'recording_added',
         'تسجيل جديد متاح',
         'New recording available',
         format('تمت إضافة "%s" إلى %s.', new.title, coalesce(session_title, 'السيشن')),
         format('"%s" was added to %s.', new.title, coalesce(session_title, 'the session')),
         '/sessions/' || new.session_id::text,
         'video:' || new.id::text
  from public.registrations r
  where r.session_id = new.session_id
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function private.notify_resource_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_title text;
begin
  select s.title into session_title from public.sessions s where s.id = new.session_id;
  insert into public.notifications (user_id, type, title_ar, title_en, body_ar, body_en, href, dedupe_key)
  select r.user_id,
         'resource_added',
         'تمت إضافة ملف جديد',
         'New resource added',
         format('تمت إضافة "%s" إلى %s.', new.title, coalesce(session_title, 'السيشن')),
         format('"%s" was added to %s.', new.title, coalesce(session_title, 'the session')),
         '/sessions/' || new.session_id::text,
         'resource:' || new.id::text
  from public.registrations r
  where r.session_id = new.session_id
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function private.notify_session_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at or new.location is distinct from old.location then
    insert into public.notifications (user_id, type, title_ar, title_en, body_ar, body_en, href, dedupe_key)
    select r.user_id,
           'session_changed',
           'تم تحديث السيشن',
           'Session updated',
           format('تم تحديث موعد أو مكان %s. افتح التفاصيل للمعلومات الجديدة.', new.title),
           format('%s has a new time or location. Open the session for the latest details.', new.title),
           '/sessions/' || new.id::text,
           'session-change:' || new.id::text || ':' || extract(epoch from now())::bigint::text
    from public.registrations r
    where r.session_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_video_added_trigger on public.session_videos;
create trigger notify_video_added_trigger after insert on public.session_videos
for each row execute function private.notify_video_added();

drop trigger if exists notify_resource_added_trigger on public.session_resources;
create trigger notify_resource_added_trigger after insert on public.session_resources
for each row execute function private.notify_resource_added();

drop trigger if exists notify_session_changed_trigger on public.sessions;
create trigger notify_session_changed_trigger after update of starts_at, location on public.sessions
for each row execute function private.notify_session_changed();

revoke all on function private.notify_video_added() from public, anon, authenticated;
revoke all on function private.notify_resource_added() from public, anon, authenticated;
revoke all on function private.notify_session_changed() from public, anon, authenticated;
