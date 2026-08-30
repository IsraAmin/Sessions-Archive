alter table public.session_videos
  add column if not exists video_provider text not null default 'youtube';

update public.session_videos
set video_provider = 'youtube'
where video_provider is null or video_provider = '';

alter table public.session_videos
  drop constraint if exists session_videos_video_provider_check;

alter table public.session_videos
  add constraint session_videos_video_provider_check
  check (video_provider in ('youtube', 'google_drive'));

create or replace function private.normalize_session_video_source()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  raw_id text;
begin
  if new.video_provider = 'google_drive' or new.youtube_video_id like 'gdrive:%' then
    raw_id := regexp_replace(new.youtube_video_id, '^gdrive:', '');
    new.video_provider := 'google_drive';
    new.youtube_video_id := 'gdrive:' || raw_id;
  else
    new.video_provider := 'youtube';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_session_video_source_trigger on public.session_videos;
create trigger normalize_session_video_source_trigger
before insert or update of video_provider, youtube_video_id on public.session_videos
for each row execute function private.normalize_session_video_source();
