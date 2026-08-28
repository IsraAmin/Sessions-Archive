create table if not exists public.session_rating_stats (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  average_rating numeric(3,2) not null default 0 check (average_rating >= 0 and average_rating <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.session_rating_stats enable row level security;
revoke all on table public.session_rating_stats from anon, authenticated;
grant select on table public.session_rating_stats to anon, authenticated;
grant all on table public.session_rating_stats to service_role;

drop policy if exists session_rating_stats_readable on public.session_rating_stats;
create policy session_rating_stats_readable
on public.session_rating_stats
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and (s.status = 'published' or public.is_admin())
  )
);

create or replace function private.refresh_session_rating_stats(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_id is null then return; end if;

  insert into public.session_rating_stats (session_id, average_rating, rating_count, updated_at)
  select
    p_session_id,
    coalesce(round(avg(f.rating)::numeric, 2), 0)::numeric(3,2),
    count(f.id)::integer,
    now()
  from public.feedback f
  where f.session_id = p_session_id
  on conflict (session_id) do update set
    average_rating = excluded.average_rating,
    rating_count = excluded.rating_count,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.refresh_session_rating_stats(uuid) from public;

create or replace function private.sync_session_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_session_rating_stats(old.session_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.session_id is distinct from new.session_id then
    perform private.refresh_session_rating_stats(old.session_id);
  end if;

  perform private.refresh_session_rating_stats(new.session_id);
  return new;
end;
$$;

revoke all on function private.sync_session_rating_stats() from public;

drop trigger if exists sync_session_rating_stats_trigger on public.feedback;
create trigger sync_session_rating_stats_trigger
after insert or delete or update of rating, session_id on public.feedback
for each row execute function private.sync_session_rating_stats();

insert into public.session_rating_stats (session_id, average_rating, rating_count, updated_at)
select
  s.id,
  coalesce(round(avg(f.rating)::numeric, 2), 0)::numeric(3,2),
  count(f.id)::integer,
  now()
from public.sessions s
left join public.feedback f on f.session_id = s.id
group by s.id
on conflict (session_id) do update set
  average_rating = excluded.average_rating,
  rating_count = excluded.rating_count,
  updated_at = excluded.updated_at;

create or replace function private.normalize_session_end_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at is not null and new.ends_at <= new.starts_at then
    new.ends_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_session_end_time() from public;

drop trigger if exists normalize_session_end_time_trigger on public.sessions;
create trigger normalize_session_end_time_trigger
before insert or update of starts_at, ends_at on public.sessions
for each row execute function private.normalize_session_end_time();

drop function if exists public.search_sessions(text, uuid);
create function public.search_sessions(search_text text default null::text, category_filter uuid default null::uuid)
returns table(
  id uuid,
  title text,
  slug text,
  description text,
  category_id uuid,
  speaker_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  capacity integer,
  cover_path text,
  status text,
  created_at timestamptz,
  category_name text,
  speaker_name text,
  average_rating numeric,
  rating_count integer
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.title, s.slug, s.description, s.category_id, s.speaker_id,
    s.starts_at, s.ends_at, s.location, s.capacity, s.cover_path, s.status, s.created_at,
    c.name as category_name,
    sp.name as speaker_name,
    coalesce(rs.average_rating, 0)::numeric as average_rating,
    coalesce(rs.rating_count, 0)::integer as rating_count
  from public.sessions s
  left join public.categories c on c.id = s.category_id
  left join public.speakers sp on sp.id = s.speaker_id
  left join public.session_rating_stats rs on rs.session_id = s.id
  where (s.status = 'published' or public.is_admin())
    and (category_filter is null or s.category_id = category_filter)
    and (
      search_text is null or btrim(search_text) = ''
      or s.title ilike '%' || search_text || '%'
      or s.description ilike '%' || search_text || '%'
      or c.name ilike '%' || search_text || '%'
      or sp.name ilike '%' || search_text || '%'
    )
  order by s.starts_at asc;
$$;

revoke all on function public.search_sessions(text, uuid) from public;
grant execute on function public.search_sessions(text, uuid) to anon, authenticated, service_role;