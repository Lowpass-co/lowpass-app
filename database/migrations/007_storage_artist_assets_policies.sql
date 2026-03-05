-- ============================================
-- LOWPASS — Storage bucket policies for artist-assets
--
-- Run this in Supabase SQL Editor AFTER creating
-- the bucket "artist-assets" in Dashboard → Storage.
-- (Create bucket: name = artist-assets, Public = ON)
-- ============================================

-- Allow logged-in users to upload (INSERT) to artist-assets
CREATE POLICY "Allow authenticated uploads to artist-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'artist-assets');

-- Allow anyone to read (SELECT) so logo/banner URLs work in app and emails
CREATE POLICY "Allow public read of artist-assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'artist-assets');
