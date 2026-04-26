-- R11: Sub-snake capacity, stage_boxes entity, structured routing columns on channel_list_rows.
-- Migrates section_stage_io → stage_boxes (preserves ids). Drops legacy stage_box text + stage_io_id.

ALTER TABLE sub_snakes
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 8;

CREATE TABLE IF NOT EXISTS stage_boxes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES rider_sections(id) ON DELETE CASCADE,
  label       text NOT NULL,
  colour      text NOT NULL,
  capacity    integer NOT NULL DEFAULT 16,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_boxes_section_idx ON stage_boxes(section_id);

INSERT INTO stage_boxes (id, pack_id, section_id, label, colour, capacity, position, created_at)
SELECT id, pack_id, section_id, label, colour, 16, position, created_at
FROM section_stage_io
ON CONFLICT (id) DO NOTHING;

ALTER TABLE channel_list_rows
  ADD COLUMN IF NOT EXISTS sub_snake_position integer,
  ADD COLUMN IF NOT EXISTS stage_box_id uuid REFERENCES stage_boxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_box_position integer;

UPDATE channel_list_rows
SET stage_box_id = stage_io_id,
    stage_box_position = 1
WHERE stage_io_id IS NOT NULL;

DO $$
DECLARE
  r RECORD;
  v_box_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT pack_id, section_id, stage_box
    FROM channel_list_rows
    WHERE stage_box_id IS NULL
      AND stage_box IS NOT NULL
      AND trim(stage_box) <> ''
  LOOP
    INSERT INTO stage_boxes (pack_id, section_id, label, colour, capacity, position)
    VALUES (r.pack_id, r.section_id, r.stage_box, '#737373', 16, 0)
    RETURNING id INTO v_box_id;

    UPDATE channel_list_rows
    SET stage_box_id = v_box_id,
        stage_box_position = 1
    WHERE pack_id = r.pack_id
      AND section_id = r.section_id
      AND stage_box = r.stage_box
      AND stage_box_id IS NULL;
  END LOOP;
END$$;

ALTER TABLE channel_list_rows DROP COLUMN IF EXISTS stage_io_id;
ALTER TABLE channel_list_rows DROP COLUMN IF EXISTS stage_box;

DROP TABLE IF EXISTS section_stage_io;

CREATE UNIQUE INDEX IF NOT EXISTS channel_list_rows_subsnake_position_unique
  ON channel_list_rows(sub_snake_id, sub_snake_position)
  WHERE sub_snake_id IS NOT NULL AND sub_snake_position IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channel_list_rows_stagebox_position_unique
  ON channel_list_rows(stage_box_id, stage_box_position)
  WHERE stage_box_id IS NOT NULL AND stage_box_position IS NOT NULL;

CREATE OR REPLACE FUNCTION public.channel_list_rows_sanitize_routing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sub_snake_id IS NULL THEN
    NEW.sub_snake_position := NULL;
  END IF;
  IF NEW.stage_box_id IS NULL THEN
    NEW.stage_box_position := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channel_list_rows_sanitize_routing ON channel_list_rows;
CREATE TRIGGER channel_list_rows_sanitize_routing
  BEFORE INSERT OR UPDATE ON channel_list_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.channel_list_rows_sanitize_routing();

ALTER TABLE stage_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stage_boxes_select" ON stage_boxes;
DROP POLICY IF EXISTS "stage_boxes_insert" ON stage_boxes;
DROP POLICY IF EXISTS "stage_boxes_update" ON stage_boxes;
DROP POLICY IF EXISTS "stage_boxes_delete" ON stage_boxes;

CREATE POLICY "stage_boxes_select"
  ON stage_boxes FOR SELECT
  USING (
    pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id())
  );

CREATE POLICY "stage_boxes_insert"
  ON stage_boxes FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "stage_boxes_update"
  ON stage_boxes FOR UPDATE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  )
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "stage_boxes_delete"
  ON stage_boxes FOR DELETE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );
