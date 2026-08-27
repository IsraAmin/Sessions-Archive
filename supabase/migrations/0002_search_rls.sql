-- Search title, description, category and speaker name without requiring pgvector.
create or replace function public.search_sessions(
  search_text text default null,
  category_filter uuid default null
)
returns table (
  id uuid,
  title text,
  slug text,
  description text,
  category_id uuid,
  speaker_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  capacity integer,
  cover_path text,
  status text,
  created_at timestamptz,
  category_name text,
  speaker_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id, s.title, s.slug, s.description, s.category_id, s.speaker_id,
    s.starts_at, s.ends_at, s.location, s.capacity, s.cover_path, s.status, s.created_at,
    c.name as category_name,
    sp.name as speaker_name
  from public.sessions s
  left join public.categories c on c.id = s.category_id
  left join public.speakers sp on sp.id = s.speaker_id
  where
    (s.status = 'published' or public.is_admin())
    and (category_filter is null or s.category_id = category_filter)
    and (
      search_text is null
      or btrim(search_text) = ''
      or s.title ilike '%' || search_text || '%'
      or s.description ilike '%' || search_text || '%'
      or c.name ilike '%' || search_text || '%'
      or sp.name ilike '%' || search_text || '%'
    )
  order by s.starts_at asc;
$$;

revoke all on function public.search_sessions(text, uuid) from public;
grant execute on function public.search_sessions(text, uuid) to anon, authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.speakers enable row level security;
alter table public.sessions enable row level security;
alter table public.registrations enable row level security;
alter table public.bookmarks enable row level security;
alter table public.feedback enable row level security;
alter table public.session_resources enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
using ((select auth.uid()) = id or public.is_admin());
create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and (avatar_path is null or split_part(avatar_path, '/', 1) = (select auth.uid())::text)
);

create policy "categories_read" on public.categories for select to anon, authenticated using (true);
create policy "categories_admin_insert" on public.categories for insert to authenticated with check (public.is_admin());
create policy "categories_admin_update" on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "categories_admin_delete" on public.categories for delete to authenticated using (public.is_admin());

create policy "speakers_read" on public.speakers for select to anon, authenticated using (true);
create policy "speakers_admin_insert" on public.speakers for insert to authenticated with check (public.is_admin());
create policy "speakers_admin_update" on public.speakers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "speakers_admin_delete" on public.speakers for delete to authenticated using (public.is_admin());

create policy "sessions_read_published_or_admin" on public.sessions for select to anon, authenticated
using (status = 'published' or public.is_admin());
create policy "sessions_admin_insert" on public.sessions for insert to authenticated with check (public.is_admin());
create policy "sessions_admin_update" on public.sessions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sessions_admin_delete" on public.sessions for delete to authenticated using (public.is_admin());

create policy "registrations_select_own_or_admin" on public.registrations for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin());
create policy "registrations_insert_own_or_admin" on public.registrations for insert to authenticated
with check ((select auth.uid()) = user_id or public.is_admin());
create policy "registrations_delete_own_or_admin" on public.registrations for delete to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

create policy "bookmarks_select_own_or_admin" on public.bookmarks for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin());
create policy "bookmarks_insert_own_or_admin" on public.bookmarks for insert to authenticated
with check ((select auth.uid()) = user_id or public.is_admin());
create policy "bookmarks_update_own_or_admin" on public.bookmarks for update to authenticated
using ((select auth.uid()) = user_id or public.is_admin())
with check ((select auth.uid()) = user_id or public.is_admin());
create policy "bookmarks_delete_own_or_admin" on public.bookmarks for delete to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

create policy "feedback_select_own_or_admin" on public.feedback for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin());
create policy "feedback_insert_own_or_admin" on public.feedback for insert to authenticated
with check ((select auth.uid()) = user_id or public.is_admin());
create policy "feedback_update_own_or_admin" on public.feedback for update to authenticated
using ((select auth.uid()) = user_id or public.is_admin())
with check ((select auth.uid()) = user_id or public.is_admin());
create policy "feedback_delete_own_or_admin" on public.feedback for delete to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

create policy "resources_read_for_published_sessions" on public.session_resources for select to authenticated
using (exists (select 1 from public.sessions s where s.id = session_id and (s.status = 'published' or public.is_admin())));
create policy "resources_admin_insert" on public.session_resources for insert to authenticated with check (public.is_admin());
create policy "resources_admin_update" on public.session_resources for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "resources_admin_delete" on public.session_resources for delete to authenticated using (public.is_admin());

create policy "push_select_own" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_insert_own" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_update_own" on public.push_subscriptions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_delete_own" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
