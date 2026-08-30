alter table public.sessions
  add column if not exists cover_focus_x smallint not null default 50,
  add column if not exists cover_focus_y smallint not null default 50;

alter table public.sessions
  drop constraint if exists sessions_cover_focus_x_check,
  add constraint sessions_cover_focus_x_check check (cover_focus_x between 0 and 100),
  drop constraint if exists sessions_cover_focus_y_check,
  add constraint sessions_cover_focus_y_check check (cover_focus_y between 0 and 100);

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
  cover_focus_x smallint,
  cover_focus_y smallint,
  status text,
  created_at timestamptz,
  category_name text,
  speaker_name text,
  average_rating numeric,
  rating_count integer
)
language sql
stable
set search_path to ''
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
    s.cover_focus_x,
    s.cover_focus_y,
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

grant execute on function public.search_sessions(text, uuid) to anon, authenticated, service_role;
