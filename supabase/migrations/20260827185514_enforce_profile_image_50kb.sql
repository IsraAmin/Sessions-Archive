-- Existing-project hardening: profile images are limited server-side to 50 KiB.
-- The frontend also compresses before upload, but this bucket limit prevents bypasses.
update storage.buckets
set file_size_limit = 51200,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'profile-images';
