alter table public.session_videos drop constraint if exists session_videos_source_id_check;

alter table public.session_videos
  add constraint session_videos_source_id_check
  check (
    (video_provider = 'youtube' and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$')
    or
    (video_provider = 'google_drive' and youtube_video_id ~ '^gdrive:[A-Za-z0-9_-]{10,}$')
  );
