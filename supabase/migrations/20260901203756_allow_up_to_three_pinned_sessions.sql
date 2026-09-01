drop trigger if exists keep_single_pinned_session_trigger on public.sessions;
drop function if exists private.keep_single_pinned_session();

create or replace function private.enforce_pinned_session_limit()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  pinned_count integer;
begin
  if new.is_pinned is true then
    perform pg_advisory_xact_lock(26090103);

    select count(*)
      into pinned_count
      from public.sessions
      where is_pinned is true
        and id <> new.id;

    if pinned_count >= 3 then
      raise exception using
        errcode = 'P0001',
        message = 'PINNED_SESSION_LIMIT_REACHED';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_pinned_session_limit_trigger
before insert or update of is_pinned on public.sessions
for each row
when (new.is_pinned is true)
execute function private.enforce_pinned_session_limit();
