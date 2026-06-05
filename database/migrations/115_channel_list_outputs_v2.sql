-- ============================================
-- LOWPASS — channel_list_rows outputs v2
-- Migration 115
-- ============================================
--
-- §CL-FIX-7. Three changes so output rows are first-class:
--   1. Independent numbering. The 040 UNIQUE (section_id,
--      row_index) forced inputs + outputs to share one sequence
--      (inputs 1..N, outputs N+1..N+M). Drop it; add a unique
--      constraint on (section_id, row_kind, row_index) so each
--      kind numbers from 1.
--   2. "Mark as stereo" — output_is_stereo boolean.
--   3. Column set NAME / DESCRIPTION / STEREO? / POSITION /
--      NOTES: add output_description (renamed from
--      output_destination) + output_position.
--
-- Non-destructive: output_destination and output_qty are KEPT
-- (one tour to confirm the rename before any drop — that drop is
-- a future migration, never destructive without Adam's sign-off).
--
-- Numbering: highest across main + active branches is 114
-- (114_ai_usage_tracking on a sibling branch); 115 is next.
-- Collision-checked across all refs per migrations/README.
--
-- Idempotent: IF EXISTS / IF NOT EXISTS guards; the backfill
-- only fills NULLs; the renumber is stable (ROW_NUMBER ordered by
-- row_index re-runs to the same 1..M).
-- ============================================

-- 1a. Drop the shared-sequence unique constraint (default name
--     from the 040 inline `UNIQUE (section_id, row_index)`).
ALTER TABLE public.channel_list_rows
  DROP CONSTRAINT IF EXISTS channel_list_rows_section_id_row_index_key;

-- 1b. New output columns.
ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS output_description text,
  ADD COLUMN IF NOT EXISTS output_is_stereo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS output_position text;

-- 2. Backfill DESCRIPTION from the old destination column.
UPDATE public.channel_list_rows
  SET output_description = output_destination
  WHERE row_kind = 'output'
    AND output_destination IS NOT NULL
    AND output_description IS NULL;

-- 3. Renumber output rows per section to 1..M (independent of
--    inputs). Safe to re-run: already-1..M stays 1..M.
WITH renumbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY row_index) AS new_index
  FROM public.channel_list_rows
  WHERE row_kind = 'output'
)
UPDATE public.channel_list_rows AS c
  SET row_index = r.new_index
  FROM renumbered r
  WHERE c.id = r.id
    AND c.row_index <> r.new_index;

-- 4. Per-kind uniqueness (ADD CONSTRAINT has no IF NOT EXISTS —
--    guard via pg_constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_list_rows_section_kind_index_unique'
  ) THEN
    ALTER TABLE public.channel_list_rows
      ADD CONSTRAINT channel_list_rows_section_kind_index_unique
      UNIQUE (section_id, row_kind, row_index);
  END IF;
END $$;

-- ============================================
-- DOWN MIGRATION (manual)
-- --------------------------------------------
-- ALTER TABLE public.channel_list_rows
--   DROP CONSTRAINT IF EXISTS channel_list_rows_section_kind_index_unique;
-- ALTER TABLE public.channel_list_rows
--   DROP COLUMN IF EXISTS output_position,
--   DROP COLUMN IF EXISTS output_is_stereo,
--   DROP COLUMN IF EXISTS output_description;
-- -- (the row_index renumber + the original shared UNIQUE are not
-- --  auto-restorable; restore from a backup if the shared
-- --  sequence must come back.)
-- ============================================
