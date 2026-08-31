alter table public.session_videos
  drop constraint if exists session_videos_video_provider_check;

alter table public.session_videos
  add constraint session_videos_video_provider_check
  check (video_provider in ('youtube', 'google_drive', 'whatsapp'));

alter table public.session_videos
  drop constraint if exists session_videos_source_id_check;

alter table public.session_videos
  add constraint session_videos_source_id_check
  check (
    (video_provider = 'youtube' and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$')
    or
    (video_provider = 'google_drive' and youtube_video_id ~ '^gdrive:[A-Za-z0-9_-]{10,}$')
    or
    (video_provider = 'whatsapp' and youtube_video_id ~* '^https://(www\.)?whatsapp\.com/channel/[A-Za-z0-9_-]+/[0-9]+/?([?][^ ]*)?$')
  );

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
  elsif new.video_provider = 'whatsapp' or new.youtube_video_id ~* '^https://(www\.)?whatsapp\.com/channel/' then
    new.video_provider := 'whatsapp';
    new.youtube_video_id := btrim(new.youtube_video_id);
  else
    new.video_provider := 'youtube';
  end if;
  return new;
end;
$$;
