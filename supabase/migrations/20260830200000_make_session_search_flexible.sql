create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalize_session_search_text(input_text text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select btrim(
    regexp_replace(
      translate(
        regexp_replace(lower(coalesce(input_text, '')), '[ًٌٍَُِّْـ]', '', 'g'),
        'أإآؤئىة',
        'اااوييه'
      ),
      '[[:punct:][:space:]]+',
      ' ',
      'g'
    )
  );
$function$;

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
  with prepared as (
    select public.normalize_session_search_text(search_text) as q
  ),
  session_rows as (
    select
      s.*,
      c.name as category_name,
      coalesce(multi_speakers.names, primary_speaker.name) as speaker_name,
      coalesce(rs.average_rating, 0)::numeric as average_rating,
      coalesce(rs.rating_count, 0)::integer as rating_count,
      public.normalize_session_search_text(
        concat_ws(' ',
          s.title,
          s.description,
          c.name,
          primary_speaker.name,
          multi_speakers.names
        )
      ) as search_blob
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
  ),
  ranked as (
    select
      r.*,
      p.q,
      case
        when p.q = '' then 0
        when public.normalize_session_search_text(r.title) = p.q then 100
        when public.normalize_session_search_text(r.title) like '%' || p.q || '%' then 90
        when r.search_blob like '%' || p.q || '%' then 80
        else greatest(
          extensions.word_similarity(p.q, public.normalize_session_search_text(r.title)) * 70,
          extensions.word_similarity(p.q, r.search_blob) * 55
        )
      end as relevance
    from session_rows r
    cross join prepared p
    where p.q = ''
      or r.search_blob like '%' || p.q || '%'
      or not exists (
        select 1
        from regexp_split_to_table(p.q, '\s+') as token
        where token <> ''
          and not (
            r.search_blob like '%' || token || '%'
            or (char_length(token) >= 4 and extensions.word_similarity(token, r.search_blob) >= 0.58)
          )
      )
      or extensions.word_similarity(p.q, r.search_blob) >= 0.52
  )
  select
    r.id,
    r.title,
    r.slug,
    r.description,
    r.category_id,
    r.speaker_id,
    r.starts_at,
    r.ends_at,
    r.location,
    r.capacity,
    r.cover_path,
    r.cover_focus_x,
    r.cover_focus_y,
    r.status,
    r.created_at,
    r.category_name,
    r.speaker_name,
    r.average_rating,
    r.rating_count
  from ranked r
  order by r.relevance desc, r.starts_at asc;
$function$;
