-- ============================================
-- LOWPASS — PASTE-READY apply file for Migration 115
-- channel_list_rows outputs v2 (§CL-FIX-7)
-- ============================================
--
-- Adam: paste this whole block into the Supabase SQL Editor and
-- Run. Non-destructive — output_destination / output_qty are
-- kept. Records itself in public._lp_migrations so the runner
-- won't re-run it.
--
-- (Optional pre-check — see how many output rows will renumber:
--   SELECT section_id, count(*) AS outputs
--   FROM public.channel_list_rows WHERE row_kind = 'output'
--   GROUP BY section_id;)

ALTER TABLE public.channel_list_rows
  DROP CONSTRAINT IF EXISTS channel_list_rows_section_id_row_index_key;

ALTER TABLE public.channel_list_rows
  ADD COLUMN IF NOT EXISTS output_description text,
  ADD COLUMN IF NOT EXISTS output_is_stereo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS output_position text;

UPDATE public.channel_list_rows
  SET output_description = output_destination
  WHERE row_kind = 'output'
    AND output_destination IS NOT NULL
    AND output_description IS NULL;

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

INSERT INTO public._lp_migrations (filename, checksum, applied_by)
VALUES ('115_channel_list_outputs_v2.sql', 'backfill', 'manual-supabase-editor')
ON CONFLICT (filename) DO NOTHING;
