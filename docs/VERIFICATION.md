# Verification Status

Verification performed against the connected Supabase development project on 2026-08-27.

## Backend

- All MVP public tables exist: `profiles`, `categories`, `speakers`, `sessions`, `registrations`, `bookmarks`, `feedback`, `session_resources`, `push_subscriptions`, `session_videos`.
- Row Level Security is enabled on every public MVP table.
- Ownership/admin policies are present for profiles, registrations, bookmarks, feedback, sessions, speakers, categories, resources, push subscriptions, and session videos.
- `search_sessions(search_text, category_filter)` exists and searches title, description, category, and speaker.
- Storage buckets exist for profile images, session covers, speaker images, and private session resources.
- `profile-images` has a verified server-side `file_size_limit = 51200`.
- `send-session-notification` Edge Function is deployed and ACTIVE with JWT verification enabled.
- Supabase Security Advisor returned no security lints, including after the YouTube recordings migration.
- Performance Advisor returned only informational `unused_index` notices, which are expected on a new/low-traffic database and are not treated as defects.

## Frontend/static checks

- Current application source passed a TypeScript syntax/transpile check across 22 TS/TSX implementation files using the available compiler.
- The declaration-only `vite-env.d.ts` is excluded from transpile-output checks because it intentionally emits no JavaScript.
- No explicit `any` occurrences were found in `src/` or the Edge Function source.
- Supabase-generated database shape was incorporated into `src/types/database.ts` and the browser client is typed with `createClient<Database>()`.
- Common YouTube URL forms are normalized to a validated video ID before storage; arbitrary iframe HTML is never stored.

## Build note

The execution environment used for this review could not reach the npm registry reliably, so dependency installation timed out and a full local `npm run build` could not be completed here.

The GitHub Actions workflow is the release check after push and runs:

```bash
npm ci
npm run typecheck
npm run build
```

A committed lockfile is required for `npm ci`.

## Push configuration

The Edge Function is deployed, but Web Push delivery also requires the following Supabase secrets to be configured:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The matching public key must be exposed to the Vite app as `VITE_VAPID_PUBLIC_KEY`. Never expose the VAPID private key in frontend environment variables.

## Profile image verification

- Connected Supabase `profile-images` bucket queried after migration: `file_size_limit = 51200`.
- Allowed avatar MIME types remain JPEG, PNG, and WebP; browser compression outputs WebP/JPEG.
- The original profile image is never uploaded directly; the browser redraws and compresses it to ≤50KB first.
- The Storage bucket rejects larger profile files even if frontend code is bypassed.

## PWA verification

- Manifest, service worker, install prompt, icons, and push click routing are present in source.
- Same-origin app assets are cached for offline revisits; Supabase/API requests are not cached.
- The UI exposes install guidance/status rather than relying on a hidden browser-only flow.

## YouTube recording verification

- `session_videos` migration applied successfully to the connected Supabase project.
- Supabase-generated TypeScript types include `public.session_videos`.
- Session details render recordings through a responsive 16:9 YouTube embed.
- Admin can paste a YouTube URL, see an embedded preview, and save only the extracted video ID.
- One session can contain multiple ordered video records.
- Read access follows the parent session publication status; writes are Admin-only via RLS.
