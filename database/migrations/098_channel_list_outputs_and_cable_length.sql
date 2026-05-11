/* ============================================
   Migration 098 — channel_list_rows: output rows + cable length
   (Sprint 12 §8a)

   Adam's actual channel list sheet models both inputs AND
   outputs (IEM mixes, drive lines, send loops, etc.). The
   existing channel_list_rows table only supported inputs.
   Adding a discriminator column lets both kinds live in one
   table with shared RLS, workspace_id, and ordering.

   Output rows use a small column set distinct from the
   input fields: output_item (the device + capsule, e.g.
   "PSM1000 w/ P10R"), output_destination (where it's sent,
   e.g. "SL MON"), output_qty (count), output_notes. Input-
   only columns (mic / di / stand / phantom_power / etc.)
   stay NULL on output rows. The editor renders the two
   kinds in separate stacked tables under the same section.

   cable_length added to support the Cables inventory
   aggregate. The §8 spec's editor table referenced it but
   the original migration draft missed it — folding into 098
   so the schema matches the spec's column list.

   Apply via: npm run db:migrate
   ============================================ */

ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS row_kind TEXT NOT NULL DEFAULT 'input',
  ADD COLUMN IF NOT EXISTS output_item TEXT,
  ADD COLUMN IF NOT EXISTS output_destination TEXT,
  ADD COLUMN IF NOT EXISTS output_qty INTEGER,
  ADD COLUMN IF NOT EXISTS output_notes TEXT,
  /* Cable length stored as text so the editor's hardcoded
     options ('6\'', '10\'', '15\'', '25\'', '50\'', '100\'',
     '150\'', '300\'') round-trip exactly; numeric typing
     would force a unit-stripping convention that's brittle. */
  ADD COLUMN IF NOT EXISTS cable_length TEXT;

/* Guarded CHECK so a re-apply doesn't trip on a duplicate
   constraint. */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'channel_list_rows_row_kind_check'
      AND conrelid = 'public.channel_list_rows'::regclass
  ) THEN
    ALTER TABLE public.channel_list_rows
      ADD CONSTRAINT channel_list_rows_row_kind_check
      CHECK (row_kind IN ('input', 'output'));
  END IF;
END $$;

/* Partial index covering the editor's per-section render
   query (filter on row_kind + section, ordered by row_index).
   Existing channel_list_rows_section_idx covers
   (section_id, row_index); this one targets the kind-split
   render path. */
CREATE INDEX IF NOT EXISTS channel_list_rows_section_kind_idx
  ON public.channel_list_rows (section_id, row_kind, row_index);

/* ============================================
   Down migration
   ============================================ */
-- DROP INDEX IF EXISTS public.channel_list_rows_section_kind_idx;
-- ALTER TABLE public.channel_list_rows DROP CONSTRAINT IF EXISTS channel_list_rows_row_kind_check;
-- ALTER TABLE public.channel_list_rows
--   DROP COLUMN IF EXISTS cable_length,
--   DROP COLUMN IF EXISTS output_notes,
--   DROP COLUMN IF EXISTS output_qty,
--   DROP COLUMN IF EXISTS output_destination,
--   DROP COLUMN IF EXISTS output_item,
--   DROP COLUMN IF EXISTS row_kind;
