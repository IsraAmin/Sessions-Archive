# Student Experience & Admin Suite

This release extends Sessions Archive with a bilingual, themeable workspace and deeper learning/admin workflows.

## Student experience

- Arabic / English interface toggle with RTL/LTR switching. User-entered content is never translated or modified.
- Light / dark theme persisted per browser.
- Desktop sidebar and mobile drawer navigation.
- In-app Notification Center with unread badge, read state, bilingual content, and deep links.
- Database-triggered notifications for new recordings, new resources, and session time/location changes.
- One-hour session reminders are synchronized while an authenticated client is active.
- YouTube IFrame API progress tracking, completion state, and Continue Watching.
- Google Calendar links and downloadable `.ics` files.
- In-platform monthly calendar for registered upcoming sessions.
- Session Series / Playlists with ordered parts.
- Consistent success/error toasts for user actions.

## Admin & Super Admin

- Dedicated analytics view with View → Registration → Attendance funnel.
- Registrations and views by session, average rating, video starts, category interest, speaker interest, and active students.
- Super Admin user management via the server-side `manage-users` Edge Function.
- Promote/demote Admin, disable/enable user, activity summary, and last sign-in.
- Super Admin accounts cannot be changed from this management screen and the caller cannot modify their own access.
- Session Series CRUD and session-to-series assignment.

## Security model

- Authorization continues to use `app_metadata`, never user-editable `user_metadata`.
- Browser code uses only the Supabase publishable key.
- `manage-users` requires a valid JWT and checks `app_metadata.super_admin === true` before using server-side Admin APIs.
- New public tables have RLS enabled with owner/admin-scoped policies.
- Notification trigger functions live in the non-exposed `private` schema and are not callable by anon/authenticated roles.

## Operational notes

- Web Push delivery still requires matching VAPID secrets in Supabase and `VITE_VAPID_PUBLIC_KEY` in the frontend.
- The current one-hour in-app reminder is client-synchronized. A future Cron/Edge Function can generate reminders even when no user has the application open.
- Supabase Security Advisor currently recommends enabling Leaked Password Protection in Auth settings.
