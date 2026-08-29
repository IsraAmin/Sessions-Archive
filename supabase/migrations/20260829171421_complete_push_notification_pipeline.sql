create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  session_reminders boolean not null default true,
  session_updates boolean not null default true,
  new_content boolean not null default true,
  announcements boolean not null default true,
  reminder_minutes smallint not null default 30 check (reminder_minutes in (5, 10, 15, 30, 60, 120, 1440)),
  language text not null default 'ar' check (language in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
on public.notification_preferences for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users insert own notification preferences" on public.notification_preferences;
create policy "users insert own notification preferences"
on public.notification_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users update own notification preferences"
on public.notification_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own notification preferences" on public.notification_preferences;
create policy "users delete own notification preferences"
on public.notification_preferences for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notification_preferences to authenticated;

insert into public.notification_preferences (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user_notification_preferences() from public, anon, authenticated;

drop trigger if exists on_auth_user_notification_preferences on auth.users;
create trigger on_auth_user_notification_preferences
after insert on auth.users
for each row execute function private.handle_new_user_notification_preferences();

create table if not exists public.notification_push_deliveries (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_push_deliveries enable row level security;
revoke all on public.notification_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.notification_push_deliveries to service_role;

create index if not exists notification_push_deliveries_status_idx
on public.notification_push_deliveries(status, updated_at);

drop trigger if exists notification_push_deliveries_updated_at on public.notification_push_deliveries;
create trigger notification_push_deliveries_updated_at
before update on public.notification_push_deliveries
for each row execute function private.set_updated_at();

insert into public.notification_push_deliveries (notification_id, status, delivered_at, last_error)
select n.id, 'skipped', now(), 'preexisting_before_automatic_push'
from public.notifications n
on conflict (notification_id) do nothing;

create table if not exists public.push_dispatch_config (
  id text primary key,
  dispatch_secret text not null,
  function_url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_dispatch_config enable row level security;
revoke all on public.push_dispatch_config from public, anon, authenticated;
grant select on public.push_dispatch_config to service_role;

drop trigger if exists push_dispatch_config_updated_at on public.push_dispatch_config;
create trigger push_dispatch_config_updated_at
before update on public.push_dispatch_config
for each row execute function private.set_updated_at();

insert into public.push_dispatch_config (id, dispatch_secret, function_url, enabled)
values (
  'default',
  encode(extensions.gen_random_bytes(32), 'hex'),
  'https://uoippuwvtufeqiejiudi.supabase.co/functions/v1/dispatch-push-notifications',
  true
)
on conflict (id) do update
set function_url = excluded.function_url,
    enabled = true;

create or replace function private.invoke_push_dispatch()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_url text;
  target_secret text;
  request_id bigint;
begin
  select c.function_url, c.dispatch_secret
  into target_url, target_secret
  from public.push_dispatch_config c
  where c.id = 'default' and c.enabled = true;

  if target_url is null or target_secret is null then
    return null;
  end if;

  select net.http_post(
    url := target_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-dispatch-secret', target_secret
    ),
    body := jsonb_build_object('source', 'cron')
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_push_dispatch() from public, anon, authenticated;

select cron.schedule(
  'sessions-archive-push-dispatch',
  '* * * * *',
  $$select private.invoke_push_dispatch();$$
);
