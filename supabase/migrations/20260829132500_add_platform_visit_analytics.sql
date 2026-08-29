create table if not exists public.platform_visits (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  visit_id uuid not null unique,
  first_path text not null default '/',
  created_at timestamptz not null default now(),
  constraint platform_visits_first_path_check check (
    char_length(first_path) between 1 and 300
    and first_path like '/%'
    and first_path not like '//%'
  )
);

create index if not exists platform_visits_visitor_created_idx
  on public.platform_visits (visitor_id, created_at desc);
create index if not exists platform_visits_created_at_idx
  on public.platform_visits (created_at desc);

alter table public.platform_visits enable row level security;

revoke all on table public.platform_visits from anon, authenticated;
grant insert on table public.platform_visits to anon, authenticated;
grant select on table public.platform_visits to authenticated;
grant select, insert, update, delete on table public.platform_visits to service_role;

drop policy if exists "Visitors can record platform visits" on public.platform_visits;
create policy "Visitors can record platform visits"
  on public.platform_visits
  for insert
  to anon, authenticated
  with check (
    char_length(first_path) between 1 and 300
    and first_path like '/%'
    and first_path not like '//%'
  );

drop policy if exists "Admins can read platform visits" on public.platform_visits;
create policy "Admins can read platform visits"
  on public.platform_visits
  for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.admin_platform_visit_stats()
returns table (
  unique_visitors bigint,
  total_visits bigint,
  today_visitors bigint,
  today_visits bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(distinct pv.visitor_id)::bigint as unique_visitors,
    count(*)::bigint as total_visits,
    count(distinct pv.visitor_id) filter (where pv.created_at >= date_trunc('day', now()))::bigint as today_visitors,
    count(*) filter (where pv.created_at >= date_trunc('day', now()))::bigint as today_visits
  from public.platform_visits pv;
$$;

revoke all on function public.admin_platform_visit_stats() from public, anon;
grant execute on function public.admin_platform_visit_stats() to authenticated, service_role;
