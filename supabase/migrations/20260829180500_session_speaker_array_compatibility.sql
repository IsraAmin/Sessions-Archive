alter table public.sessions
add column if not exists speaker_ids uuid[] not null default '{}'::uuid[];

update public.sessions s
set speaker_ids = coalesce((
  select array_agg(ss.speaker_id order by ss.position, ss.created_at)
  from public.session_speakers ss
  where ss.session_id = s.id
), case when s.speaker_id is not null then array[s.speaker_id]::uuid[] else '{}'::uuid[] end)
where coalesce(array_length(s.speaker_ids, 1), 0) = 0;

create or replace function private.normalize_session_speaker_ids()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized uuid[];
begin
  select coalesce(array_agg(x order by first_pos), '{}'::uuid[])
  into normalized
  from (
    select value as x, min(ord) as first_pos
    from unnest(coalesce(new.speaker_ids, '{}'::uuid[])) with ordinality as u(value, ord)
    where value is not null
    group by value
  ) q;

  if coalesce(array_length(normalized, 1), 0) = 0 and new.speaker_id is not null then
    normalized := array[new.speaker_id]::uuid[];
  end if;

  new.speaker_ids := normalized;
  new.speaker_id := case when coalesce(array_length(normalized, 1), 0) > 0 then normalized[1] else null end;
  return new;
end;
$$;

create or replace function private.sync_session_speaker_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_speakers where session_id = new.id;

  insert into public.session_speakers (session_id, speaker_id, position)
  select new.id, value, (ord - 1)::smallint
  from unnest(coalesce(new.speaker_ids, '{}'::uuid[])) with ordinality as u(value, ord)
  where value is not null
  on conflict (session_id, speaker_id) do update set position = excluded.position;

  return new;
end;
$$;

revoke all on function private.sync_session_speaker_links() from public, anon, authenticated;

drop trigger if exists normalize_session_speaker_ids_trigger on public.sessions;
create trigger normalize_session_speaker_ids_trigger
before insert or update of speaker_ids, speaker_id on public.sessions
for each row execute function private.normalize_session_speaker_ids();

drop trigger if exists sync_session_speaker_links_trigger on public.sessions;
create trigger sync_session_speaker_links_trigger
after insert or update of speaker_ids, speaker_id on public.sessions
for each row execute function private.sync_session_speaker_links();

update public.sessions set speaker_ids = speaker_ids;
