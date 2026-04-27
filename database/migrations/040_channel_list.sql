-- ============================================
-- LOWPASS — Channel list sections, sub-snakes, mic library
-- Migration 040
-- ============================================

-- Section layout kind: existing rows default to "fields" (JSON field list).
DO $t$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_section_type') THEN
    CREATE TYPE rider_section_type AS ENUM ('fields', 'channel_list');
  END IF;
END
$t$;

ALTER TABLE rider_sections
  ADD COLUMN IF NOT EXISTS section_type rider_section_type NOT NULL DEFAULT 'fields';

-- Mic library (workspace + global seeds)
CREATE TABLE IF NOT EXISTS mic_library (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('dynamic','condenser','ribbon','di_active','di_passive')),
  default_phantom boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mic_library_workspace_idx ON mic_library(workspace_id);

-- Sub-snakes (per pack-section; references rider_sections)
CREATE TABLE IF NOT EXISTS sub_snakes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES rider_sections(id) ON DELETE CASCADE,
  label       text NOT NULL,
  colour      text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_snakes_section_idx ON sub_snakes(section_id);

-- Channel list rows
CREATE TABLE IF NOT EXISTS channel_list_rows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id      uuid NOT NULL REFERENCES rider_sections(id) ON DELETE CASCADE,
  row_index       integer NOT NULL,
  channel_name    text NOT NULL DEFAULT '',
  sub_snake_id    uuid REFERENCES sub_snakes(id) ON DELETE SET NULL,
  stage_box       text NOT NULL DEFAULT '',
  position        text NOT NULL DEFAULT '',
  mic             text NOT NULL DEFAULT '',
  mic_substitute  text NOT NULL DEFAULT '',
  di              text NOT NULL DEFAULT '',
  stand           text NOT NULL DEFAULT '',
  phantom_power   boolean,
  provider        text CHECK (provider IS NULL OR provider IN ('band','venue','hire')),
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, row_index)
);

CREATE INDEX IF NOT EXISTS channel_list_rows_section_idx ON channel_list_rows(section_id, row_index);

CREATE OR REPLACE FUNCTION channel_list_rows_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channel_list_rows_updated_at ON channel_list_rows;
CREATE TRIGGER channel_list_rows_updated_at
  BEFORE UPDATE ON channel_list_rows
  FOR EACH ROW EXECUTE FUNCTION channel_list_rows_set_updated_at();

-- Transactional reorder: RLS applies; invoker must own the pack.
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
BEGIN
  IF p_ordered_ids IS NULL OR coalesce(array_length(p_ordered_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;
  FOR i IN 1..array_length(p_ordered_ids, 1) LOOP
    r_id := p_ordered_ids[i];
    UPDATE channel_list_rows
    SET row_index = i, updated_at = now()
    WHERE id = r_id AND section_id = p_section_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_channel_list_rows(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_channel_list_rows(uuid, uuid[]) TO service_role;

-- RLS
ALTER TABLE sub_snakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_list_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE mic_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_snakes_select"
  ON sub_snakes FOR SELECT
  USING (
    pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id())
  );

CREATE POLICY "sub_snakes_insert"
  ON sub_snakes FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "sub_snakes_update"
  ON sub_snakes FOR UPDATE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "sub_snakes_delete"
  ON sub_snakes FOR DELETE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "channel_list_rows_select"
  ON channel_list_rows FOR SELECT
  USING (
    pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id())
  );

CREATE POLICY "channel_list_rows_insert"
  ON channel_list_rows FOR INSERT
  WITH CHECK (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "channel_list_rows_update"
  ON channel_list_rows FOR UPDATE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "channel_list_rows_delete"
  ON channel_list_rows FOR DELETE
  USING (
    pack_id IN (
      SELECT id FROM rider_packs
      WHERE workspace_id = public.get_my_workspace_id()
        AND (scope <> 'artist' OR public.is_workspace_admin())
    )
  );

CREATE POLICY "mic_library_select"
  ON mic_library FOR SELECT
  USING (
    workspace_id IS NULL
    OR workspace_id = public.get_my_workspace_id()
  );

CREATE POLICY "mic_library_insert"
  ON mic_library FOR INSERT
  WITH CHECK (
    workspace_id = public.get_my_workspace_id()
  );

CREATE POLICY "mic_library_update"
  ON mic_library FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "mic_library_delete"
  ON mic_library FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- Global mic seeds (workspace_id NULL); idempotent
INSERT INTO mic_library (workspace_id, name, type, default_phantom)
SELECT NULL, v.name, v.type, v.phantom
FROM (
  VALUES
    ('Beta 91A', 'condenser'::text, true),
    ('Beta 52A', 'dynamic', false),
    ('SM57', 'dynamic', false),
    ('SM58', 'dynamic', false),
    ('Beta 56A', 'dynamic', false),
    ('Beta 98A', 'condenser', true),
    ('KM184', 'condenser', true),
    ('C414', 'condenser', true),
    ('Radial JDI', 'di_passive', false),
    ('Radial J48', 'di_active', true),
    ('Sennheiser e604', 'dynamic', false),
    ('Sennheiser e609', 'dynamic', false)
) AS v(name, type, phantom)
WHERE NOT EXISTS (
  SELECT 1 FROM mic_library m WHERE m.workspace_id IS NULL AND m.name = v.name
);
