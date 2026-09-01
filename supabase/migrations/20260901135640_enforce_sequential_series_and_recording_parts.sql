-- Normalize existing series positions so every series is contiguous: 1, 2, 3, ...
with ranked as (
  select
    id,
    row_number() over (
      partition by series_id
      order by series_position nulls last, starts_at, created_at, id
    )::integer as next_position
  from public.sessions
  where series_id is not null
)
update public.sessions s
set series_position = ranked.next_position
from ranked
where s.id = ranked.id
  and s.series_position is distinct from ranked.next_position;

-- Normalize existing recording parts so every session has exactly one recording per Part.
with ranked as (
  select
    id,
    row_number() over (
      partition by session_id
      order by part_number, position, created_at, id
    )::integer as next_part
  from public.session_videos
)
update public.session_videos v
set part_number = ranked.next_part,
    position = 0
from ranked
where v.id = ranked.id
  and (v.part_number is distinct from ranked.next_part or v.position <> 0);

alter table public.sessions
  drop constraint if exists sessions_series_position_positive_check;

alter table public.sessions
  add constraint sessions_series_position_positive_check
  check (series_position is null or series_position >= 1);

alter table public.session_videos
  drop constraint if exists session_videos_part_number_positive_check;

alter table public.session_videos
  add constraint session_videos_part_number_positive_check
  check (part_number >= 1);

create unique index if not exists sessions_series_position_unique
  on public.sessions (series_id, series_position)
  where series_id is not null;

create unique index if not exists session_videos_session_part_unique
  on public.session_videos (session_id, part_number);

create or replace function private.enforce_session_series_sequence()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  expected_position integer;
begin
  if new.series_id is null then
    new.series_position := null;
    return new;
  end if;

  if new.series_position is null or new.series_position < 1 then
    raise exception using
      errcode = '23514',
      message = 'لازم تحددي Part صحيح للسلسلة، ويبدأ من 1. / Series Part must start at 1.';
  end if;

  if tg_op = 'UPDATE' then
    if old.series_id is not distinct from new.series_id
       and old.series_position is not distinct from new.series_position then
      return new;
    end if;

    select candidate
      into expected_position
    from generate_series(
      1,
      coalesce((
        select max(s.series_position)
        from public.sessions s
        where s.series_id = new.series_id
          and s.id <> new.id
      ), 0) + 1
    ) as candidate
    where not exists (
      select 1
      from public.sessions s
      where s.series_id = new.series_id
        and s.series_position = candidate
        and s.id <> new.id
    )
    order by candidate
    limit 1;
  else
    select candidate
      into expected_position
    from generate_series(
      1,
      coalesce((
        select max(s.series_position)
        from public.sessions s
        where s.series_id = new.series_id
      ), 0) + 1
    ) as candidate
    where not exists (
      select 1
      from public.sessions s
      where s.series_id = new.series_id
        and s.series_position = candidate
    )
    order by candidate
    limit 1;
  end if;

  expected_position := coalesce(expected_position, 1);

  if new.series_position <> expected_position then
    raise exception using
      errcode = '23514',
      message = format(
        'الـPart المطلوب الآن لهذه السلسلة هو Part %s. ما ممكن تكرري Part موجود أو تتخطي الترتيب. / The next required series part is Part %s.',
        expected_position,
        expected_position
      );
  end if;

  return new;
end;
$$;

create or replace function private.enforce_session_video_part_sequence()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  expected_part integer;
begin
  if new.part_number is null or new.part_number < 1 then
    raise exception using
      errcode = '23514',
      message = 'Part التسجيل لازم يبدأ من 1. / Recording Part must start at 1.';
  end if;

  if tg_op = 'UPDATE' then
    if old.session_id is not distinct from new.session_id
       and old.part_number is not distinct from new.part_number then
      new.position := 0;
      return new;
    end if;

    select candidate
      into expected_part
    from generate_series(
      1,
      coalesce((
        select max(v.part_number)
        from public.session_videos v
        where v.session_id = new.session_id
          and v.id <> new.id
      ), 0) + 1
    ) as candidate
    where not exists (
      select 1
      from public.session_videos v
      where v.session_id = new.session_id
        and v.part_number = candidate
        and v.id <> new.id
    )
    order by candidate
    limit 1;
  else
    select candidate
      into expected_part
    from generate_series(
      1,
      coalesce((
        select max(v.part_number)
        from public.session_videos v
        where v.session_id = new.session_id
      ), 0) + 1
    ) as candidate
    where not exists (
      select 1
      from public.session_videos v
      where v.session_id = new.session_id
        and v.part_number = candidate
    )
    order by candidate
    limit 1;
  end if;

  expected_part := coalesce(expected_part, 1);

  if new.part_number <> expected_part then
    raise exception using
      errcode = '23514',
      message = format(
        'Part التسجيل المطلوب الآن هو Part %s. ما ممكن تضيفي Part مكرر أو تتخطي الترتيب. / The next required recording part is Part %s.',
        expected_part,
        expected_part
      );
  end if;

  new.position := 0;
  return new;
end;
$$;

drop trigger if exists enforce_session_series_sequence_trigger on public.sessions;
create trigger enforce_session_series_sequence_trigger
before insert or update of series_id, series_position on public.sessions
for each row
execute function private.enforce_session_series_sequence();

drop trigger if exists enforce_session_video_part_sequence_trigger on public.session_videos;
create trigger enforce_session_video_part_sequence_trigger
before insert or update of session_id, part_number on public.session_videos
for each row
execute function private.enforce_session_video_part_sequence();
