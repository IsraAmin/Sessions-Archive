-- Store YouTube references only. Video files remain hosted by YouTube.
create table if not exists public.session_videos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, youtube_video_id)
);

create index if not exists session_videos_session_position_idx
  on public.session_videos(session_id, position, created_at);

create trigger session_videos_updated_at
  before update on public.session_videos
  for each row execute function private.set_updated_at();

alter table public.session_videos enable row level security;

create policy "session_videos_read_published_or_admin"
  on public.session_videos for select to anon, authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and (s.status = 'published' or public.is_admin())
    )
  );

create policy "session_videos_admin_insert"
  on public.session_videos for insert to authenticated
  with check (public.is_admin());

create policy "session_videos_admin_update"
  on public.session_videos for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "session_videos_admin_delete"
  on public.session_videos for delete to authenticated
  using (public.is_admin());

revoke all on table public.session_videos from anon, authenticated;
grant select on table public.session_videos to anon, authenticated;
grant insert, update, delete on table public.session_videos to authenticated;
