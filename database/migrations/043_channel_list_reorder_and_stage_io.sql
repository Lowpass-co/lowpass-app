-- Fix reorder_channel_list_rows: bump row_index out of 1..n first to avoid
-- UNIQUE (section_id, row_index) violations when swapping.
CREATE OR REPLACE FUNCTION public.reorder_channel_list_rows(
  p_section_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  i int;
  r_id uuid;
  n int;
BEGIN
  IF p_ordered_ids IS NULL OR coalesce(array_length(p_ordered_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;
  n := array_length(p_ordered_ids, 1);

  UPDATE channel_list_rows
  SET row_index = row_index + 1000000, updated_at = now()
  WHERE section_id = p_section_id;

  FOR i IN 1..n LOOP
    r_id := p_ordered_ids[i];
    UPDATE channel_list_rows
    SET row_index = i, updated_at = now()
    WHERE id = r_id AND section_id = p_section_id;
  END LOOP;
END;
$$;

-- Stage I/O labels per section (e.g. 16A, 16B) for the I/O column
CREATE TABLE IF NOT EXISTS section_stage_io (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES rider_sections(id) ON DELETE CASCADE,
  label       text NOT NULL,
  colour      text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS section_stage_io_section_idx ON section_stage_io(section_id, position);

ALTER TABLE section_stage_io ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe if a previous run created policies before failure on a later statement.
DROP POLICY IF EXISTS "section_stage_io_select" ON section_stage_io;
DROP POLICY IF EXISTS "section_stage_io_insert" ON section_stage_io;
DROP POLICY IF EXISTS "section_stage_io_update" ON section_stage_io;
DROP POLICY IF EXISTS "section_stage_io_delete" ON section_stage_io;

CREATE POLICY "section_stage_io_select"
  ON section_stage_io FOR SELECT
  USING (
    pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id())
  );

CREATE POLICY "section_stage_io_insert"
  ON section_stage_io FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "section_stage_io_update"
  ON section_stage_io FOR UPDATE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "section_stage_io_delete"
  ON section_stage_io FOR DELETE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

ALTER TABLE channel_list_rows
  ADD COLUMN IF NOT EXISTS stage_io_id uuid REFERENCES section_stage_io(id) ON DELETE SET NULL;
