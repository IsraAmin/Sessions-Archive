revoke all on table public.events, public.event_media from anon, authenticated;
grant select on table public.events, public.event_media to anon;
grant select, insert, update, delete on table public.events, public.event_media to authenticated;
grant all privileges on table public.events, public.event_media to service_role;
