with folder_candidates as (
  select distinct on (m.event_id)
    m.event_id,
    m.source_url
  from public.event_media m
  where m.media_type = 'image'
    and m.provider = 'external'
    and m.source_url ~* '^https?://(www\.)?drive\.google\.com/.*/folders/[A-Za-z0-9_-]+'
  order by m.event_id, m.position, m.created_at
)
update public.events e
set drive_folder_url = f.source_url,
    updated_at = now()
from folder_candidates f
where e.id = f.event_id
  and e.drive_folder_url is null;

delete from public.event_media m
using public.events e
where m.event_id = e.id
  and m.media_type = 'image'
  and m.provider = 'external'
  and m.source_url ~* '^https?://(www\.)?drive\.google\.com/.*/folders/[A-Za-z0-9_-]+'
  and e.drive_folder_url = m.source_url;
