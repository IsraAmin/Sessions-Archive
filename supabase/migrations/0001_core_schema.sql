-- Sessions Archive MVP schema
-- PostgreSQL / Supabase

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt())->'app_metadata'->>'role', '') = 'admin';
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  university text,
  department text,
  level text,
  bio text check (bio is null or char_length(bio) <= 1000),
  avatar_path text check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text,
  organization text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text not null,
  category_id uuid references public.categories(id) on delete set null,
  speaker_id uuid references public.speakers(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  capacity integer not null default 30 check (capacity > 0),
  cover_path text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create table public.session_resources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text not null,
  file_path text not null unique,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_status_starts_at_idx on public.sessions(status, starts_at);
create index sessions_category_idx on public.sessions(category_id);
create index sessions_speaker_idx on public.sessions(speaker_id);
create index sessions_created_by_idx on public.sessions(created_by);
create index sessions_title_trgm_idx on public.sessions using gin (title extensions.gin_trgm_ops);
create index sessions_description_trgm_idx on public.sessions using gin (description extensions.gin_trgm_ops);
create index speakers_name_trgm_idx on public.speakers using gin (name extensions.gin_trgm_ops);
create index registrations_user_idx on public.registrations(user_id);
create index registrations_session_idx on public.registrations(session_id);
create index bookmarks_user_idx on public.bookmarks(user_id);
create index bookmarks_session_idx on public.bookmarks(session_id);
create index feedback_session_idx on public.feedback(session_id);
create index session_resources_session_idx on public.session_resources(session_id);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function private.set_updated_at();
create trigger speakers_updated_at before update on public.speakers for each row execute function private.set_updated_at();
create trigger sessions_updated_at before update on public.sessions for each row execute function private.set_updated_at();
create trigger bookmarks_updated_at before update on public.bookmarks for each row execute function private.set_updated_at();
create trigger feedback_updated_at before update on public.feedback for each row execute function private.set_updated_at();
create trigger push_subscriptions_updated_at before update on public.push_subscriptions for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, 'student'), '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Capacity enforcement is database-side. The lock makes the capacity check atomic.
create or replace function private.enforce_registration_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_status text;
  target_capacity integer;
  current_count integer;
begin
  if not public.is_admin() and new.user_id <> (select auth.uid()) then
    raise exception 'You can only register yourself';
  end if;

  select s.status, s.capacity
    into target_status, target_capacity
  from public.sessions s
  where s.id = new.session_id
  for update;

  if target_status is null then
    raise exception 'Session not found';
  end if;

  if not public.is_admin() and target_status <> 'published' then
    raise exception 'Session is not open for registration';
  end if;

  select count(*) into current_count
  from public.registrations r
  where r.session_id = new.session_id;

  if current_count >= target_capacity then
    raise exception 'Session capacity reached';
  end if;

  return new;
end;
$$;

create trigger registrations_capacity_guard
  before insert on public.registrations
  for each row execute function private.enforce_registration_rules();
