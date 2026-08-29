create schema if not exists private;
revoke all on schema private from public;

alter table public.admin_activity_log drop constraint if exists admin_activity_log_action_check;
alter table public.admin_activity_log drop constraint if exists admin_activity_log_entity_type_check;

update public.admin_activity_log
set action = case action
  when 'session_created' then 'created'
  when 'session_updated' then 'updated'
  when 'session_deleted' then 'deleted'
  else action
end;

alter table public.admin_activity_log
  add constraint admin_activity_log_action_check
  check (action in ('created','updated','deleted','notification_sent','user_role_changed','user_banned','user_unbanned'));

alter table public.admin_activity_log
  add constraint admin_activity_log_entity_type_check
  check (entity_type in ('category','speaker','series','session','video','resource','notification','user'));

drop policy if exists "Admins can read activity log" on public.admin_activity_log;
drop policy if exists "Super admins can read activity log" on public.admin_activity_log;
create policy "Super admins can read activity log"
on public.admin_activity_log
for select
to authenticated
using ((select public.is_super_admin()));

revoke all on public.admin_activity_log from anon;
revoke insert, update, delete on public.admin_activity_log from authenticated;
grant select on public.admin_activity_log to authenticated;

create or replace function private.log_admin_content_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_data jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  old_data jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  source_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor uuid := auth.uid();
  label text;
  entity_kind text;
  action_kind text;
  changed_fields text[] := array[]::text[];
begin
  if actor is null or not public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  entity_kind := case tg_table_name
    when 'categories' then 'category'
    when 'speakers' then 'speaker'
    when 'session_series' then 'series'
    when 'sessions' then 'session'
    when 'session_videos' then 'video'
    when 'session_resources' then 'resource'
    else tg_table_name
  end;

  label := coalesce(source_data ->> 'title', source_data ->> 'name', source_data ->> 'id', entity_kind);
  action_kind := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' when 'DELETE' then 'deleted' end;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), array[]::text[])
      into changed_fields
    from jsonb_each(new_data) n
    join jsonb_each(old_data) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at');

    if coalesce(array_length(changed_fields, 1), 0) = 0 then return new; end if;
  end if;

  insert into public.admin_activity_log (actor_user_id, action, entity_type, entity_id, entity_label, details)
  values (
    actor,
    action_kind,
    entity_kind,
    nullif(source_data ->> 'id', '')::uuid,
    label,
    case when tg_op = 'UPDATE' then jsonb_build_object('changed_fields', to_jsonb(changed_fields)) else '{}'::jsonb end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.log_admin_content_activity() from public;

drop trigger if exists sessions_admin_activity_log on public.sessions;

drop trigger if exists categories_admin_activity_log on public.categories;
create trigger categories_admin_activity_log after insert or update or delete on public.categories for each row execute function private.log_admin_content_activity();

drop trigger if exists speakers_admin_activity_log on public.speakers;
create trigger speakers_admin_activity_log after insert or update or delete on public.speakers for each row execute function private.log_admin_content_activity();

drop trigger if exists series_admin_activity_log on public.session_series;
create trigger series_admin_activity_log after insert or update or delete on public.session_series for each row execute function private.log_admin_content_activity();

drop trigger if exists sessions_admin_activity_log on public.sessions;
create trigger sessions_admin_activity_log after insert or update or delete on public.sessions for each row execute function private.log_admin_content_activity();

drop trigger if exists videos_admin_activity_log on public.session_videos;
create trigger videos_admin_activity_log after insert or update or delete on public.session_videos for each row execute function private.log_admin_content_activity();

drop trigger if exists resources_admin_activity_log on public.session_resources;
create trigger resources_admin_activity_log after insert or update or delete on public.session_resources for each row execute function private.log_admin_content_activity();
