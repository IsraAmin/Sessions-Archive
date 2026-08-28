create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null check (action in ('session_created', 'session_updated', 'session_deleted', 'notification_sent')),
  entity_type text not null check (entity_type in ('session', 'notification')),
  entity_id uuid,
  entity_label text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx
  on public.admin_activity_log (created_at desc);
create index if not exists admin_activity_log_actor_idx
  on public.admin_activity_log (actor_user_id, created_at desc);

alter table public.admin_activity_log enable row level security;
revoke all on table public.admin_activity_log from anon, authenticated;
grant select on table public.admin_activity_log to authenticated;

drop policy if exists "Admins can read activity log" on public.admin_activity_log;
create policy "Admins can read activity log"
  on public.admin_activity_log
  for select
  to authenticated
  using ((select public.is_admin()));

create schema if not exists private;

create or replace function private.capture_session_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  action_name text;
  target_id uuid;
  target_label text;
begin
  if actor is null or not public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    action_name := 'session_created';
    target_id := new.id;
    target_label := new.title;
  elsif tg_op = 'UPDATE' then
    if old is not distinct from new then return new; end if;
    action_name := 'session_updated';
    target_id := new.id;
    target_label := new.title;
  elsif tg_op = 'DELETE' then
    action_name := 'session_deleted';
    target_id := old.id;
    target_label := old.title;
  else
    return coalesce(new, old);
  end if;

  insert into public.admin_activity_log (actor_user_id, action, entity_type, entity_id, entity_label)
  values (actor, action_name, 'session', target_id, target_label);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.capture_session_admin_activity() from public, anon, authenticated;

drop trigger if exists sessions_admin_activity_log on public.sessions;
create trigger sessions_admin_activity_log
after insert or update or delete on public.sessions
for each row execute function private.capture_session_admin_activity();
