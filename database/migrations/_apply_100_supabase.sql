/* ============================================================
   APPLY 100 in Supabase SQL Editor (Sprint 12 §9a)

   Five additive columns. Fully idempotent.
   ============================================================ */


-- 1. artists.default_logo_url
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS default_logo_url TEXT;

-- 2. rider_packs cover-page columns
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS cover_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_subtitle TEXT,
  ADD COLUMN IF NOT EXISTS cover_disclaimer TEXT;

-- 3. rider_sections.metadata (holds Tiptap docs for rich_text sections,
--    plus the §8b3 Mics/DIs inventory notes)
ALTER TABLE public.rider_sections
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;


-- Tracking insert
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('100_rider_editor_rebuild_foundation.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;


/* ============================================================
   Post-apply verification (run separately)

   1. metadata column populated on every rider_sections row
      SELECT
        count(*) FILTER (WHERE metadata IS NOT NULL) AS with_metadata,
        count(*) FILTER (WHERE metadata IS NULL)     AS null_metadata,
        count(*) AS total
      FROM public.rider_sections;
      -- Expect: with_metadata = total, null_metadata = 0

   2. Cover columns exist on rider_packs
      SELECT
        column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'rider_packs'
        AND column_name IN ('cover_logo_url', 'cover_subtitle', 'cover_disclaimer');
      -- Expect: 3 rows

   3. default_logo_url exists on artists
      SELECT
        column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'artists'
        AND column_name = 'default_logo_url';
      -- Expect: 1 row

   4. Tracking row recorded
      SELECT filename, applied_at FROM public._lp_migrations
      WHERE filename = '100_rider_editor_rebuild_foundation.sql';
      -- Expect: 1 row
   ============================================================ */
