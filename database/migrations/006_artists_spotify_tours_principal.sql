-- ============================================
-- LOWPASS — Artists Spotify + Tour Principal Count
-- Migration 006
--
-- Artists: Spotify id/image/banner for search;
-- logo and banner stored in branding JSONB (logo_url = for exports).
-- Tours: principal_count for principal artists.
--
-- Also required: Create Storage bucket "artist-assets" in Supabase
-- Dashboard → Storage → New bucket → name: artist-assets, Public: ON.
-- Add policy: Allow authenticated uploads (INSERT) and public read (SELECT).
-- ============================================

-- ARTISTS: Spotify fields (profile from Spotify; logo for exports is in branding.logo_url)
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS spotify_id TEXT,
  ADD COLUMN IF NOT EXISTS spotify_image_url TEXT,
  ADD COLUMN IF NOT EXISTS spotify_banner_url TEXT;

-- TOURS: Principal artists count (e.g. 2 principals + 3 band + crew)
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS principal_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN artists.spotify_id IS 'Spotify artist ID when linked from Spotify search';
COMMENT ON COLUMN artists.spotify_image_url IS 'Profile image URL from Spotify (not used on exports)';
COMMENT ON COLUMN artists.spotify_banner_url IS 'Banner/large image URL from Spotify if available';
COMMENT ON COLUMN tours.principal_count IS 'Number of principal artists (e.g. 2 for Good Neighbours)';
