alter table public.events
  add column if not exists cover_url text,
  add column if not exists cover_focus_x smallint,
  add column if not exists cover_focus_y smallint;

alter table public.events
  drop constraint if exists events_cover_focus_x_check,
  drop constraint if exists events_cover_focus_y_check;

alter table public.events
  add constraint events_cover_focus_x_check check (cover_focus_x is null or cover_focus_x between 0 and 100),
  add constraint events_cover_focus_y_check check (cover_focus_y is null or cover_focus_y between 0 and 100);

comment on column public.events.cover_url is 'Optional dedicated event cover image URL. May point to a public Google Drive image or another public image URL.';
comment on column public.events.cover_focus_x is 'Horizontal cover focal point percentage, 0-100.';
comment on column public.events.cover_focus_y is 'Vertical cover focal point percentage, 0-100.';
