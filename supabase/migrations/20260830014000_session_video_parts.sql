-- Group multiple recordings within one session into numbered parts.
alter table public.session_videos add column if not exists part_number integer not null default 1;
alter table public.session_videos drop constraint if exists session_videos_part_number_check;
alter table public.session_videos add constraint session_videos_part_number_check check (part_number >= 1);
create index if not exists session_videos_session_part_position_idx on public.session_videos (session_id, part_number, position, created_at);
