# Sessions Archive

Functional student sessions platform built with React + Vite + TypeScript + Supabase (Auth, PostgreSQL, Storage, RLS, and an Edge Function for Web Push).

The starter follows the requested MVP order: authentication, profiles, sessions, details, registration, bookmarks, feedback/rating, speakers, admin dashboard, statistics, search/filters, storage, then security hardening. QR attendance, certificates, advanced analytics, AI recommendations, and pgvector are intentionally left for later phases.

## Architecture

```text
React / Vite / TypeScript
        |
        | @supabase/supabase-js (publishable key only)
        v
Supabase Auth ---- JWT ----> Data API / RPC / Storage
        |                         |
        |                         v
        +-------------------> PostgreSQL
                                  |
                             RLS policies
                                  |
                         auth.uid() ownership
                         app_metadata.role=admin

Admin browser -- user JWT --> Supabase Edge Function --> Web Push providers
                                      |
                                      +-- secret VAPID keys
```

The frontend never receives a secret/service-role key. React route guards are UX only; authorization is enforced by PostgreSQL RLS, Storage policies, and the authenticated Edge Function.

## Database model

```text
auth.users 1 ─── 1 profiles
     │
     ├──< registrations >── sessions >── categories
     │                       │
     ├──< bookmarks ---------┤
     │                       ├── speakers
     ├──< feedback ----------┤
     │                       └──< session_resources
     └──< push_subscriptions
```

Current MVP uses one primary speaker per session (`sessions.speaker_id`). A many-to-many `session_speakers` table can be added later only if a real requirement for multiple speakers appears.

## Security rules implemented

- A user can select/update only their own profile; an admin can read profiles for dashboard statistics.
- A user can create a registration only with `user_id = auth.uid()` and delete only their own registration.
- Registration capacity and published-session status are enforced in PostgreSQL, not in React.
- A user can create/update/delete only bookmarks whose `user_id = auth.uid()`.
- A user can create/update/delete only feedback whose `user_id = auth.uid()`.
- Admin-managed CRUD for categories, speakers, sessions, and session-resource metadata requires `app_metadata.role = 'admin'` in RLS.
- Admin authorization is never stored in user-editable `user_metadata`.
- RLS is enabled on every exposed `public` table.
- Storage writes are protected by ownership/admin policies.
- Push broadcast is allowed only through a JWT-protected Edge Function that re-checks `public.is_admin()` before using privileged access.

## Search

`public.search_sessions(search_text, category_filter)` is a real PostgreSQL RPC and searches:

- Session title
- Description
- Category name
- Speaker name

`pg_trgm` indexes support the MVP. `pgvector` is intentionally not required and can be introduced later for semantic search or AI recommendations.

## Storage

The migration creates four buckets:

| Bucket | Public? | Write access |
|---|---:|---|
| `profile-images` | Yes | Authenticated user, own `{user_id}/...` folder only |
| `session-covers` | Yes | Admin only |
| `speaker-images` | Yes | Admin only |
| `session-resources` | No | Admin only; authenticated download for published sessions |

Because the first three are public buckets, their files are intentionally publicly readable by URL. RLS controls uploads/updates/deletes; public-bucket downloads do not require object SELECT policies.

## PWA and Push Notifications

The project uses a small manual PWA setup instead of `vite-plugin-pwa`:

- `public/manifest.webmanifest`
- `public/sw.js` (same-origin app assets are cached after first successful load for offline revisits; Supabase/API requests are never cached)
- install icons
- service-worker registration in `src/main.tsx`
- browser Push subscription capture in `src/lib/push.ts`
- `push_subscriptions` with owner RLS
- `supabase/functions/send-session-notification/` for admin broadcast

Only `VITE_VAPID_PUBLIC_KEY` belongs in the browser. `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` must be Supabase Edge Function secrets.

## Local setup

1. Use Node.js 22+.
2. Copy `.env.example` to `.env`.
3. Fill:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (optional until Push is configured)
4. Install dependencies: `npm install`.
5. Apply the SQL files in `supabase/migrations/` in filename order (`0001` → `0002` → `0003` → `0004`).
6. Optionally run `supabase/seed/seed.sql`.
7. Start the app: `npm run dev`.

The migrations create the database schema, Search RPC, RLS policies, least-privilege Data API grants, indexes, and Storage buckets/policies. Review any migration before applying it to an existing populated database.

## Bootstrap the first admin

Promote the first account only from a privileged Supabase dashboard/server workflow. Do not expose this update to browser users.

Example for the Supabase SQL editor after replacing the email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

The user should sign out and sign back in after promotion so the refreshed JWT includes the new `app_metadata` claim.

## Configure Web Push

Generate one VAPID key pair using a trusted Web Push tool/package, then:

1. Put the public key in the frontend environment as `VITE_VAPID_PUBLIC_KEY`.
2. Set the Edge Function secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:admin@example.com"
```

3. Deploy the function:

```bash
supabase functions deploy send-session-notification
```

`supabase/config.toml` keeps `verify_jwt = true`, and the function also calls `public.is_admin()` before broadcasting.

## Type safety

The Supabase browser client is parameterized with the database schema in `src/types/database.ts`, generated from the connected project shape. Domain-facing UI types remain in `src/types/domain.ts`. No `any` is intentionally used in the application source.

## Quality checks

```bash
npm run typecheck
npm run build
```

The GitHub Actions workflow runs both on pushes to `main` and pull requests. Commit the generated `package-lock.json` after `npm install` so CI can use `npm ci`. See `docs/VERIFICATION.md` for the checks already performed and the remaining local build step.

## Deployment

Frontend: Vercel or Netlify.

Set the same public `VITE_...` variables in the hosting platform. Never add Supabase secret/service-role keys or the VAPID private key to frontend deployment variables.

Backend: Supabase hosted project with migration + Edge Function deployed.

## Current MVP coverage

- Authentication
- User profile edit + profile image upload
- Session listing
- Real session search/filter
- Session details
- Registration/cancellation
- Bookmarks
- Feedback/rating
- Speaker information
- Admin dashboard
- Basic statistics chart
- Admin CRUD for categories, speakers, sessions
- Admin uploads for session covers, speaker images, session resources
- Supabase Storage policies
- PostgreSQL RLS/security
- PWA baseline
- Push subscription + admin broadcast Edge Function

## Later phases

- QR Code attendance
- Certificates
- Scheduled/targeted notifications and notification preferences
- Advanced analytics
- Multiple speakers per session if needed
- AI recommendations
- Semantic search with pgvector
