# Sessions Archive — Architecture

## 1. Goal

A student-focused, mobile-first platform for discovering sessions, registering, bookmarking, rating, and administering content. The MVP deliberately keeps the stack small:

```text
React + TypeScript + Vite
          |
          v
   @supabase/supabase-js
          |
          v
Supabase Auth + Data API + Storage + Edge Functions
          |
          v
      PostgreSQL + RLS
```

No custom application server is required for the MVP. Authorization is enforced by PostgreSQL RLS, Storage policies, and server-side checks inside Edge Functions—not by React route guards alone.

## 2. Frontend layers

- `pages/`: route-level screens.
- `components/`: reusable UI and route guards.
- `hooks/`: authentication/session state.
- `lib/`: Supabase client, push logic, shared helpers.
- `types/`: domain models.
- `public/sw.js`: service worker for PWA + push receipt.

Frontend route guards improve UX only. They are never treated as the security boundary.

## 3. Backend layers

### Authentication

Supabase Auth provides email/password authentication. A database trigger creates one `profiles` row for each new `auth.users` row.

### Authorization

- Normal ownership uses `auth.uid()`.
- Admin authorization uses `auth.jwt()->app_metadata->role = 'admin'` through `public.is_admin()`.
- Users cannot edit `app_metadata` from the browser SDK.
- Admin mutations are protected by RLS on every admin-managed table.
- Registration capacity is enforced in a database trigger under a row lock, so simultaneous clients cannot bypass capacity through frontend requests.

### Data

```text
auth.users 1 ─── 1 profiles
     │
     ├──< registrations >── sessions >── categories
     │                       │
     ├──< bookmarks ---------┤
     │                       ├── speakers
     ├──< feedback ----------┤
     │                       ├──< session_resources
     │                       └──< session_videos
     └──< push_subscriptions
```

For MVP simplicity, each session has zero or one primary speaker. If multiple speakers become a confirmed requirement, add a join table later instead of paying that complexity now.

### Storage

- `profile-images`: public bucket; users upload/update/delete only inside their own `{user_id}/...` folder.
- `session-covers`: public bucket; admin writes only.
- `speaker-images`: public bucket; admin writes only.
- `session-resources`: private bucket; authenticated users can create signed URLs only for resources tied to published sessions; admin writes only.

### Search

`search_sessions(search_text, category_filter)` searches:

- session title
- session description
- category name
- speaker name

`pg_trgm` supports fuzzy substring performance for the MVP. `pgvector` is intentionally deferred until semantic search/recommendations are actually needed.

## 4. PWA + Push

The MVP includes:

- web app manifest
- installable icon files
- service worker registration
- push subscription capture in `push_subscriptions`
- an authenticated admin-only Supabase Edge Function for Web Push delivery

The Edge Function receives the caller's JWT, verifies the user mode, calls `public.is_admin()`, and only then uses its privileged client to enumerate subscriptions. VAPID private material stays in Supabase secrets; only the public VAPID key is exposed to the browser.

## 5. Security model

| Resource | Normal user | Admin |
| --- | --- | --- |
| Profile | Select/update own | Select all for administration/statistics |
| Registration | Select/create/delete own | Manage all |
| Bookmark | CRUD own | Manage all |
| Feedback | CRUD own | Manage all |
| Sessions | Read published | CRUD all |
| Categories | Read | CRUD |
| Speakers | Read | CRUD |
| Session resource metadata | Read for published sessions | CRUD |
| Session YouTube videos | Read for published sessions | CRUD |
| Push subscriptions | CRUD own | Broadcast function reads all via privileged server context |

The frontend publishable key is safe to ship only because RLS/Storage policies constrain it. Supabase secret keys and VAPID private keys must never be placed in Vite environment variables.

## 6. Deployment

Frontend: Vercel or Netlify.

Backend: Supabase hosted project with the migration and Edge Function deployed.

SPA rewrite files are included for both Vercel and Netlify. GitHub CI runs type checking and production builds.

## 7. Future extensions

1. QR attendance.
2. Certificates.
3. Notification preferences and scheduled/targeted notifications.
4. Richer admin analytics.
5. Multiple-speaker support if requested.
6. pgvector embeddings + semantic search.
7. Personalized AI recommendations.

These are intentionally separated from the MVP so the initial product remains maintainable.

## 8. Migrations

- `0001_core_schema.sql`: extensions, tables, relationships, indexes, profile trigger, and atomic registration-capacity enforcement.
- `0002_search_rls.sql`: real session Search RPC and RLS policies.
- `0003_storage.sql`: Storage buckets and Storage RLS policies.
- `0004_least_privilege_grants.sql`: least-privilege Data API table grants; RLS remains the row-level authorization boundary.
- `20260827185514_enforce_profile_image_50kb.sql`: hardens the existing profile bucket to 51,200 bytes.
- `20260827190100_session_youtube_videos.sql`: adds multi-video YouTube recording references with Admin-only writes.

## Profile image pipeline

```text
User image (any browser-decodable image)
        |
        v
Canvas redraw -> WebP/JPEG quality + dimension reduction
        |
        | guaranteed <= 50 KiB before upload
        v
Supabase Storage: profile-images
        |
        | bucket file_size_limit = 51,200 bytes
        v
profiles.avatar_path
```

The browser compression improves UX, while the Storage bucket limit is the security boundary and prevents bypassing the frontend.

## PWA / Push flow

```text
manifest + service worker -> installable app / offline revisits
          |
          +-> PushManager subscription -> push_subscriptions (owner RLS)
                                              |
Admin JWT -> send-session-notification Edge Function -> Web Push provider
                                              |
                                      VAPID secrets stay server-side
```

## YouTube recording flow

```text
Admin uploads recording to YouTube
        |
        v
Paste YouTube URL in Admin UI
        |
        v
Client extracts + validates 11-char video ID
        |
        v
session_videos (Admin-only writes via RLS)
        |
        v
Published session details -> responsive YouTube embed player
```

The database never stores the video file. A session can have multiple ordered recordings. Public users can read video references only when the parent session is published.
