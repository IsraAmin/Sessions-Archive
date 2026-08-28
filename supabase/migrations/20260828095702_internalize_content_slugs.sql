create or replace function private.assign_internal_content_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'sessions' then
      new.slug := 'session-' || replace(new.id::text, '-', '');
    elsif tg_table_name = 'categories' then
      new.slug := 'category-' || replace(new.id::text, '-', '');
    end if;
  elsif tg_op = 'UPDATE' then
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

revoke all on function private.assign_internal_content_slug() from public;

drop trigger if exists assign_internal_session_slug on public.sessions;
create trigger assign_internal_session_slug
before insert or update of slug on public.sessions
for each row execute function private.assign_internal_content_slug();

drop trigger if exists assign_internal_category_slug on public.categories;
create trigger assign_internal_category_slug
before insert or update of slug on public.categories
for each row execute function private.assign_internal_content_slug();
