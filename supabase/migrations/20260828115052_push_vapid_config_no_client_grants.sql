revoke all on table public.push_vapid_config from public, anon, authenticated;
grant select, insert, update on table public.push_vapid_config to service_role;
