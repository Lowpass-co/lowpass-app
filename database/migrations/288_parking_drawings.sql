/* ============================================================
   MIGRATION 288 — venue drawings on parking maps (Nov 2026, Adam)

   A venue's own plan (a PDF or JPG in tour Files), laid on a parking map at
   true scale: for car parks the satellite can't see (trucks inside the
   building, a basement dock) and for checking a drawing against the
   satellite. 3D cuts the roof away over an "inside" drawing and shows it as
   the floor.

     drawings   jsonb array, written ONLY through parseDrawings()
                (src/lib/parking/model.ts): each drawing names its file
                (file_references.id), page, crop, scale (metres per PDF
                point / image pixel), placement (metres + compass
                rotation), whether it's inside, its floor height and clear
                height. No pixels from anyone's screen, no image data:
                the file stays in tour Files.

   The index serves "last time at this venue": a new map at a venue offers
   the latest other map's drawings there, already calibrated.

   The app works before this is pasted (it reads without the column, and
   says so if you try to save a drawing).

   HAND-PASTE into the Supabase SQL editor. Idempotent: a re-run is a no-op.
   ============================================================ */

ALTER TABLE public.parking_maps
  ADD COLUMN IF NOT EXISTS drawings JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parking_maps_drawings_chk' AND conrelid = 'public.parking_maps'::regclass
  ) THEN
    ALTER TABLE public.parking_maps
      ADD CONSTRAINT parking_maps_drawings_chk CHECK (jsonb_typeof(drawings) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS parking_maps_venue_idx
  ON public.parking_maps (workspace_id, canonical_venue_id, updated_at DESC);

/* ── Checks (optional) ───────────────────────────────────────
   SELECT column_name, data_type, column_default FROM information_schema.columns
   WHERE table_name = 'parking_maps' AND column_name = 'drawings';
   -- expect: drawings | jsonb | '[]'::jsonb */

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP INDEX IF EXISTS public.parking_maps_venue_idx;
   ALTER TABLE public.parking_maps DROP CONSTRAINT IF EXISTS parking_maps_drawings_chk;
   ALTER TABLE public.parking_maps DROP COLUMN IF EXISTS drawings;
   ============================================================ */
