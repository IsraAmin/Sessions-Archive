create or replace function private.touch_push_vapid_config_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_push_vapid_config_updated_at() from public;

drop trigger if exists touch_push_vapid_config_updated_at on public.push_vapid_config;
create trigger touch_push_vapid_config_updated_at
before update on public.push_vapid_config
for each row execute function private.touch_push_vapid_config_updated_at();
