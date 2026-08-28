create table if not exists public.user_directory (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  phone text,
  role text not null default 'student' check (role in ('admin','student')),
  super_admin boolean not null default false,
  banned_until timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  is_anonymous boolean not null default false,
  providers text[] not null default '{}'
);

alter table public.user_directory enable row level security;
revoke all on table public.user_directory from anon;
revoke all on table public.user_directory from authenticated;
grant select on table public.user_directory to authenticated;
grant all on table public.user_directory to service_role;

drop policy if exists user_directory_super_admin_select on public.user_directory;
create policy user_directory_super_admin_select
on public.user_directory
for select
to authenticated
using ((select public.is_super_admin()));

create or replace function private.sync_user_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_directory (
    id, email, phone, role, super_admin, banned_until, created_at, updated_at,
    last_sign_in_at, email_confirmed_at, phone_confirmed_at, is_anonymous, providers
  ) values (
    new.id,
    coalesce(new.email, ''),
    new.phone,
    case when coalesce(new.raw_app_meta_data ->> 'role', '') = 'admin' then 'admin' else 'student' end,
    coalesce((new.raw_app_meta_data ->> 'super_admin')::boolean, false),
    new.banned_until,
    new.created_at,
    new.updated_at,
    new.last_sign_in_at,
    new.email_confirmed_at,
    new.phone_confirmed_at,
    coalesce(new.is_anonymous, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb))), '{}'::text[])
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    super_admin = excluded.super_admin,
    banned_until = excluded.banned_until,
    updated_at = excluded.updated_at,
    last_sign_in_at = excluded.last_sign_in_at,
    email_confirmed_at = excluded.email_confirmed_at,
    phone_confirmed_at = excluded.phone_confirmed_at,
    is_anonymous = excluded.is_anonymous,
    providers = excluded.providers;
  return new;
end;
$$;

revoke all on function private.sync_user_directory() from public;

insert into public.user_directory (
  id, email, phone, role, super_admin, banned_until, created_at, updated_at,
  last_sign_in_at, email_confirmed_at, phone_confirmed_at, is_anonymous, providers
)
select
  u.id,
  coalesce(u.email, ''),
  u.phone,
  case when coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin' then 'admin' else 'student' end,
  coalesce((u.raw_app_meta_data ->> 'super_admin')::boolean, false),
  u.banned_until,
  u.created_at,
  u.updated_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  u.phone_confirmed_at,
  coalesce(u.is_anonymous, false),
  coalesce(array(select jsonb_array_elements_text(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb))), '{}'::text[])
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  phone = excluded.phone,
  role = excluded.role,
  super_admin = excluded.super_admin,
  banned_until = excluded.banned_until,
  updated_at = excluded.updated_at,
  last_sign_in_at = excluded.last_sign_in_at,
  email_confirmed_at = excluded.email_confirmed_at,
  phone_confirmed_at = excluded.phone_confirmed_at,
  is_anonymous = excluded.is_anonymous,
  providers = excluded.providers;

drop trigger if exists on_auth_user_sync_directory on auth.users;
create trigger on_auth_user_sync_directory
after insert or update on auth.users
for each row execute function private.sync_user_directory();
