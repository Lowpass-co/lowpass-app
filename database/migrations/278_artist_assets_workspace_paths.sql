-- ============================================
-- LOWPASS — Artist logo / banner uploads work again
-- Migration 278
-- ============================================
--
-- THE BUG. Edit artist → Logo / Banner failed with "new row violates
-- row-level security policy". Migration 206 scoped writes to the
-- artist-assets bucket to the caller's own uid folder ("{auth.uid}/…"),
-- checking only ONE uploader (/api/upload/artist-asset). The Edit artist
-- uploader (/api/artists/[id]/image/[kind]) writes to a stable per-artist
-- path, "{workspace_id}/{artist_id}/{logo|banner}.{ext}", so every upload
-- there has been refused since 206 — and removing/replacing an image, and
-- deleting an artist, have silently left their files behind.
--
-- THE FIX. Add write policies for that path shape, scoped as tightly as the
-- path allows: the first folder must be the caller's workspace AND the second
-- must be an artist in that workspace. 206's own-uid policies stay as they
-- are (the new-artist uploader still uses them). Public read is unchanged.
--
-- Idempotent: each policy is dropped by name before it is created.
-- ============================================

DROP POLICY IF EXISTS "artist_assets_insert_ws_artist" ON storage.objects;
CREATE POLICY "artist_assets_insert_ws_artist"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  AND EXISTS (
    SELECT 1 FROM public.artists a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.workspace_id = public.get_my_workspace_id()
  )
);

-- Re-uploading replaces the file in place (upsert), which is an UPDATE.
DROP POLICY IF EXISTS "artist_assets_update_ws_artist" ON storage.objects;
CREATE POLICY "artist_assets_update_ws_artist"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  AND EXISTS (
    SELECT 1 FROM public.artists a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.workspace_id = public.get_my_workspace_id()
  )
)
WITH CHECK (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  AND EXISTS (
    SELECT 1 FROM public.artists a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.workspace_id = public.get_my_workspace_id()
  )
);

-- Removing an image, and the artist-delete cleanup, remove these files.
DROP POLICY IF EXISTS "artist_assets_delete_ws_artist" ON storage.objects;
CREATE POLICY "artist_assets_delete_ws_artist"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'artist-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
  AND EXISTS (
    SELECT 1 FROM public.artists a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.workspace_id = public.get_my_workspace_id()
  )
);

-- Check (expect 3 rows):
-- SELECT policyname FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'artist_assets_%_ws_artist';

-- ============================================
-- DOWN (manual):
-- DROP POLICY IF EXISTS "artist_assets_insert_ws_artist" ON storage.objects;
-- DROP POLICY IF EXISTS "artist_assets_update_ws_artist" ON storage.objects;
-- DROP POLICY IF EXISTS "artist_assets_delete_ws_artist" ON storage.objects;
-- ============================================
