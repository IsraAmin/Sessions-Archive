-- Defense in depth for Supabase Data API table privileges.
-- RLS remains authoritative for row ownership/admin checks, while these GRANTs
-- remove table-level operations the application never needs (for example,
-- Registration UPDATE and anonymous access to resource metadata).

revoke all privileges on table
  public.profiles,
  public.categories,
  public.speakers,
  public.sessions,
  public.registrations,
  public.bookmarks,
  public.feedback,
  public.session_resources,
  public.push_subscriptions
from anon, authenticated;

-- Public catalogue data.
grant select on public.categories, public.speakers, public.sessions to anon;

-- Signed-in user surface. RLS narrows each statement to owned/admin rows.
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.registrations to authenticated;
grant select, insert, update, delete on public.bookmarks, public.feedback, public.push_subscriptions to authenticated;

-- Admin-managed tables need write privileges at the Data API layer; their RLS
-- policies still require public.is_admin() for mutations.
grant select, insert, update, delete on
  public.categories,
  public.speakers,
  public.sessions,
  public.session_resources
to authenticated;
