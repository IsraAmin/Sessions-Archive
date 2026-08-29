create table if not exists public.session_speakers (
  session_id uuid not null references public.sessions(id) on delete cascade,
  speaker_id uuid not null references public.speakers(id) on delete cascade,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (session_id, speaker_id)
);

create index if not exists session_speakers_speaker_idx on public.session_speakers(speaker_id);
create index if not exists session_speakers_session_position_idx on public.session_speakers(session_id, position);

alter table public.session_speakers enable row level security;

drop policy if exists "public read published session speakers" on public.session_speakers;
create policy "public read published session speakers"
on public.session_speakers for select
to anon, authenticated
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and (s.status = 'published' or public.is_admin())
  )
);

drop policy if exists "admins insert session speakers" on public.session_speakers;
create policy "admins insert session speakers"
on public.session_speakers for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins update session speakers" on public.session_speakers;
create policy "admins update session speakers"
on public.session_speakers for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins delete session speakers" on public.session_speakers;
create policy "admins delete session speakers"
on public.session_speakers for delete
to authenticated
using (public.is_admin());

grant select on public.session_speakers to anon, authenticated;
grant insert, update, delete on public.session_speakers to authenticated;

insert into public.session_speakers (session_id, speaker_id, position)
select id, speaker_id, 0
from public.sessions
where speaker_id is not null
on conflict (session_id, speaker_id) do nothing;

create or replace function public.search_sessions(search_text text default null::text, category_filter uuid default null::uuid)
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
as $function$
  select
    s.id,
    s.title,
    s.slug,
    s.description,
    s.category_id,
    s.speaker_id,
    s.starts_at,
    s.ends_at,
    s.location,
    s.capacity,
    s.cover_path,
    s.status,
    s.created_at,
    c.name as category_name,
    coalesce(multi_speakers.names, primary_speaker.name) as speaker_name,
    coalesce(rs.average_rating, 0)::numeric as average_rating,
    coalesce(rs.rating_count, 0)::integer as rating_count
  from public.sessions s
  left join public.categories c on c.id = s.category_id
  left join public.speakers primary_speaker on primary_speaker.id = s.speaker_id
  left join lateral (
    select string_agg(sp.name, '، ' order by ss.position, sp.name) as names
    from public.session_speakers ss
    join public.speakers sp on sp.id = ss.speaker_id
    where ss.session_id = s.id
  ) multi_speakers on true
  left join public.session_rating_stats rs on rs.session_id = s.id
  where (s.status = 'published' or public.is_admin())
    and (category_filter is null or s.category_id = category_filter)
    and (
      search_text is null or btrim(search_text) = ''
      or s.title ilike '%' || search_text || '%'
      or s.description ilike '%' || search_text || '%'
      or c.name ilike '%' || search_text || '%'
      or primary_speaker.name ilike '%' || search_text || '%'
      or exists (
        select 1
        from public.session_speakers ss_search
        join public.speakers sp_search on sp_search.id = ss_search.speaker_id
        where ss_search.session_id = s.id
          and sp_search.name ilike '%' || search_text || '%'
      )
    )
  order by s.starts_at asc;
$function$;
