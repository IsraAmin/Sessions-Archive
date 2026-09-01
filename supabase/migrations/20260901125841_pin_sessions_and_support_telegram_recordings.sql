alter table public.sessions
  add column if not exists is_pinned boolean not null default false;

create or replace function private.keep_single_pinned_session()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.is_pinned then
    update public.sessions
      set is_pinned = false
      where is_pinned = true
        and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_single_pinned_session_trigger on public.sessions;
create trigger keep_single_pinned_session_trigger
before insert or update of is_pinned on public.sessions
for each row
when (new.is_pinned = true)
execute function private.keep_single_pinned_session();

alter table public.session_videos
  drop constraint if exists session_videos_video_provider_check;

alter table public.session_videos
  add constraint session_videos_video_provider_check
  check (video_provider in ('youtube', 'google_drive', 'whatsapp', 'telegram'));

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
    or
    (video_provider = 'telegram' and youtube_video_id ~* '^https://(t\.me|telegram\.me)/[^[:space:]]+$')
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
  elsif new.video_provider = 'telegram' or new.youtube_video_id ~* '^https://(t\.me|telegram\.me)/' then
    new.video_provider := 'telegram';
    new.youtube_video_id := btrim(new.youtube_video_id);
  else
    new.video_provider := 'youtube';
  end if;
  return new;
end;
$$;
