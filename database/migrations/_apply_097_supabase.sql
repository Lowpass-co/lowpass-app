/* ============================================================
   APPLY 097 in Supabase SQL Editor (Sprint 12 §7)

   *** URGENT — missing this migration is the likely cause of
   pages crashing across the app, because §7+ code queries
   rider_packs.kind which doesn't exist until 097 lands. ***

   Three additive columns. Fully idempotent. Safe to re-run.
   ============================================================ */


-- 1. kind discriminator + CHECK constraint
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'rider';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rider_packs_kind_check'
      AND conrelid = 'public.rider_packs'::regclass
  ) THEN
    ALTER TABLE public.rider_packs
      ADD CONSTRAINT rider_packs_kind_check
      CHECK (kind IN ('rider', 'channel_list'));
  END IF;
END $$;

-- 2. linked_rider_pack_id self-FK (channel-list-to-tech-rider link)
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS linked_rider_pack_id UUID
    REFERENCES public.rider_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rider_packs_linked_rider_pack_idx
  ON public.rider_packs(linked_rider_pack_id)
  WHERE linked_rider_pack_id IS NOT NULL;

-- 3. propagated_from_template_at audit column
ALTER TABLE public.rider_packs
  ADD COLUMN IF NOT EXISTS propagated_from_template_at TIMESTAMPTZ;


-- Tracking insert
INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES
  ('097_rider_packs_kind_and_artist_library.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;


/* ============================================================
   Post-apply verification

   1. Three new columns exist on rider_packs
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'rider_packs'
        AND column_name IN ('kind', 'linked_rider_pack_id', 'propagated_from_template_at')
      ORDER BY column_name;
      -- Expect: 3 rows

   2. All existing rows backfilled to kind='rider'
      SELECT kind, count(*) FROM public.rider_packs GROUP BY kind ORDER BY kind;
      -- Expect: kind='rider' with count = total existing packs (4)

   3. Tracking row recorded
      SELECT filename, applied_at FROM public._lp_migrations
      WHERE filename = '097_rider_packs_kind_and_artist_library.sql';
   ============================================================ */
