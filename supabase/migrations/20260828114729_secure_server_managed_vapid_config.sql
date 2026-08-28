create table if not exists public.push_vapid_config (
  id text primary key default 'default' check (id = 'default'),
  public_key text not null,
  private_key text not null,
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_vapid_config enable row level security;

revoke all on table public.push_vapid_config from public, anon, authenticated;
grant select, insert, update on table public.push_vapid_config to service_role;

comment on table public.push_vapid_config is 'Server-only VAPID key material for Web Push. Never expose private_key to browser clients.';
