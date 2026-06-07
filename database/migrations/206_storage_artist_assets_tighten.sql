-- ============================================
-- LOWPASS — Tighten artist-assets storage policy (Security audit §M5)
-- Migration 206
-- ============================================
--
-- Migration 007 created the artist-assets bucket policies:
--   INSERT  TO authenticated  WITH CHECK (bucket_id = 'artist-assets')
--   SELECT  TO public         USING      (bucket_id = 'artist-assets')
--
-- The INSERT had NO folder/owner scoping: ANY authenticated user (any
-- workspace) could upload anywhere in the shared bucket, including
-- overwriting another workspace's object path, or dumping arbitrary
-- files (storage-abuse vector). The uploader
-- (src/app/api/upload/artist-asset/route.ts) already names objects
-- `${user.id}/<type>-<ts>.<ext>`, so scoping INSERT/UPDATE/DELETE to the
-- caller's own uid folder — exactly like the avatars bucket (migration
-- 025) — closes the hole WITHOUT changing the upload code or breaking
-- existing object URLs.
--
-- Public SELECT is RETAINED intentionally: artist logos/banners are
-- embedded in outbound emails and public share/intake pages, so they
-- must be world-readable. (Asset paths are unguessable per-user UUID +
-- timestamp; no tenant identifier leaks via the path.)
--
-- Idempotent — drops by name before recreating. Recorded in
-- public._lp_migrations on apply.
-- ============================================

-- Replace the unscoped INSERT policy with an own-folder one.
DROP POLICY IF EXISTS "Allow authenticated uploads to artist-assets" ON storage.objects;
DROP POLICY IF EXISTS "artist_assets_insert_own" ON storage.objects;
CREATE POLICY "artist_assets_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow owners to overwrite/replace their own assets (logo re-upload).
DROP POLICY IF EXISTS "artist_assets_update_own" ON storage.objects;
CREATE POLICY "artist_assets_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow owners to delete their own assets.
DROP POLICY IF EXISTS "artist_assets_delete_own" ON storage.objects;
CREATE POLICY "artist_assets_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Public read retained (logos in emails / share pages). Recreate by the
-- original name so this migration is self-contained + idempotent.
DROP POLICY IF EXISTS "Allow public read of artist-assets" ON storage.objects;
CREATE POLICY "Allow public read of artist-assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'artist-assets');

/* ============================================================
   DOWN MIGRATION (manual) — restores the 007 unscoped INSERT
   ----------------------------------------------------------
   DROP POLICY IF EXISTS "artist_assets_insert_own"  ON storage.objects;
   DROP POLICY IF EXISTS "artist_assets_update_own"  ON storage.objects;
   DROP POLICY IF EXISTS "artist_assets_delete_own"  ON storage.objects;
   CREATE POLICY "Allow authenticated uploads to artist-assets"
     ON storage.objects FOR INSERT TO authenticated
     WITH CHECK (bucket_id = 'artist-assets');
   ============================================================ */
