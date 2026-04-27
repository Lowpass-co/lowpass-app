-- NOT the first step for channel-list / stage_boxes. Use this ONLY when:
--   046 already ran (you have column channel_list_rows.stage_box_id) but
--   CREATE INDEX channel_list_rows_stagebox_position_unique failed with 23505
--   (duplicate positions).
-- If you still have stage_io_id and no stage_box_id, run
--   046_channel_list_routing.sql in full (Supabase → SQL → paste entire file) — not 047.

DO $guard$
BEGIN
  IF to_regclass('public.channel_list_rows') IS NULL THEN
    RAISE EXCEPTION
      '047: table channel_list_rows missing. Apply earlier rider pack migrations (040+).';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channel_list_rows'
      AND column_name = 'stage_box_id'
  ) THEN
    RAISE EXCEPTION
      '047: column channel_list_rows.stage_box_id not found. Your DB is still on the pre-046 schema (e.g. stage_io_id). '
      'Run database/migrations/046_channel_list_routing.sql in full first as postgres; do not use 047 until 046 has added those columns.';
  END IF;
END
$guard$;

-- Renumber 1..n per stage box so the unique index can be created.
UPDATE channel_list_rows AS clr
SET stage_box_position = s.rn
FROM (
  SELECT id,
    row_number() OVER (PARTITION BY stage_box_id ORDER BY row_index, id) AS rn
  FROM channel_list_rows
  WHERE stage_box_id IS NOT NULL
) s
WHERE clr.id = s.id;

CREATE UNIQUE INDEX IF NOT EXISTS channel_list_rows_stagebox_position_unique
  ON channel_list_rows(stage_box_id, stage_box_position)
  WHERE stage_box_id IS NOT NULL AND stage_box_position IS NOT NULL;
