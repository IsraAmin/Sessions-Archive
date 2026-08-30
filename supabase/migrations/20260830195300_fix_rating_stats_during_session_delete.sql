create or replace function private.refresh_session_rating_stats(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_session_id is null then
    return;
  end if;

  -- During ON DELETE CASCADE from sessions, feedback rows are removed after
  -- the parent session is no longer visible. Do not recreate rating stats
  -- for a session that is being deleted.
  if not exists (select 1 from public.sessions s where s.id = p_session_id) then
    delete from public.session_rating_stats where session_id = p_session_id;
    return;
  end if;

  insert into public.session_rating_stats (session_id, average_rating, rating_count, updated_at)
  select
    p_session_id,
    coalesce(round(avg(f.rating)::numeric, 2), 0)::numeric(3,2),
    count(f.id)::integer,
    now()
  from public.feedback f
  where f.session_id = p_session_id
  on conflict (session_id) do update set
    average_rating = excluded.average_rating,
    rating_count = excluded.rating_count,
    updated_at = excluded.updated_at;
end;
$function$;
