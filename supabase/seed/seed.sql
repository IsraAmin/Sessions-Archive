insert into public.categories (name, slug, description) values
  ('Technology', 'technology', 'Software, data and technology sessions'),
  ('Career', 'career', 'Career preparation and professional skills'),
  ('Design', 'design', 'Design and creative practice')
on conflict (slug) do nothing;

insert into public.speakers (name, organization, bio)
select 'Mona Hassan', 'Student Tech Community', 'Software engineer and community mentor'
where not exists (select 1 from public.speakers where name = 'Mona Hassan');

insert into public.sessions (title, slug, description, category_id, speaker_id, starts_at, ends_at, location, capacity, status)
select
  'Building Your First Full-Stack App',
  'first-full-stack-app',
  'A practical student-friendly introduction to building a secure full-stack web application.',
  c.id,
  sp.id,
  now() + interval '7 days',
  now() + interval '7 days 2 hours',
  'Main Lab',
  40,
  'published'
from public.categories c
cross join public.speakers sp
where c.slug = 'technology' and sp.name = 'Mona Hassan'
  and not exists (select 1 from public.sessions where slug = 'first-full-stack-app');
