# Security Notes

## RLS is the source of truth

React route guards are UX controls only. Every exposed table in `public` has RLS enabled. Ownership policies combine the `authenticated` database role with `auth.uid()` checks.

## Admin role

Admin authorization is read from `app_metadata.role` through `public.is_admin()`. Do not move this flag to user-editable `user_metadata`.

After changing a user's app metadata, that user should sign out/in or otherwise refresh the auth token so the JWT contains the new claim.

Example one-time setup from a privileged Supabase SQL editor:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

Never expose this operation to normal browser users.

## Service/secret keys

A Supabase secret/service-role key is never used by the Vite app. The Edge Function gets a privileged server context from the Supabase runtime only after the incoming user JWT is verified.

## Registration capacity

Capacity is checked in a `BEFORE INSERT` trigger that locks the target session row. The trigger also rejects non-published sessions for normal users and rejects attempts to register a different `user_id`.

## Storage

- Profile uploads must start with the current user's UUID folder.
- Session/speaker media and resource uploads require Admin RLS.
- Public buckets (`profile-images`, `session-covers`, `speaker-images`) are intentionally publicly readable by URL; Storage RLS protects writes, not public downloads.
- `session-resources` is private and is delivered with short-lived signed URLs to authenticated users for published sessions.
- Storage upserts have INSERT + SELECT + UPDATE policies where replacement is supported.
- `profile-images` has a server-side `file_size_limit` of 51,200 bytes. Client compression is convenience, not the security boundary.

## Push

Only the VAPID public key belongs in the browser. `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` belong in Supabase secrets.

`send-session-notification` uses `verify_jwt = true`, then checks `public.is_admin()` with the caller-scoped client before reading all subscriptions with the privileged server client. Invalid/stale 404/410 push endpoints are cleaned up after delivery attempts.

## YouTube recordings

`session_videos` stores only YouTube video IDs, not arbitrary iframe HTML or video files. The column has a database check for the 11-character YouTube ID shape. RLS allows public/authenticated reads only when the parent session is published, while insert/update/delete require `public.is_admin()`.

The frontend builds the embed URL itself instead of storing user-provided embed markup, avoiding arbitrary iframe injection through database content.
