create or replace function private.queue_notification_push_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_push_deliveries (notification_id, status)
  values (new.id, 'pending')
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

revoke all on function private.queue_notification_push_delivery() from public, anon, authenticated;

drop trigger if exists queue_notification_push_delivery_trigger on public.notifications;
create trigger queue_notification_push_delivery_trigger
after insert on public.notifications
for each row execute function private.queue_notification_push_delivery();

insert into public.notification_push_deliveries (notification_id, status)
select n.id, 'pending'
from public.notifications n
left join public.notification_push_deliveries d on d.notification_id = n.id
where d.notification_id is null
on conflict (notification_id) do nothing;
