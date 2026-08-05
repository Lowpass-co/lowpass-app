-- ============================================
-- 256 — DOCUMENT VERSIONS + ATTACHMENTS (rider decouple, phase A)
--
-- Channel lists and stage plots become first-class DOCUMENTS with named
-- versions, ATTACHED to riders / shows / tours instead of owned by the rider
-- inheritance chain. Adam's model (2026-08-05): one version = one source of
-- truth; editing a version updates everywhere it is attached; a show that
-- needs to differ gets its own named version ("Saturday — with keys").
--
-- Storage stays on rider_packs (kind='channel_list'|'stage_plot') — this adds
-- lineage + the attachment relation, it does NOT move rows.
--
-- Idempotent / re-runnable (hand-pasted; _lp_migrations not maintained).
-- ============================================

-- Version lineage: a saved version points at its root document. Root packs
-- have version_of_pack_id NULL. version_label is the human name shown in
-- pickers ("Festival 8-piece", "Saturday — with keys").
ALTER TABLE rider_packs ADD COLUMN IF NOT EXISTS version_of_pack_id uuid REFERENCES rider_packs(id) ON DELETE SET NULL;
ALTER TABLE rider_packs ADD COLUMN IF NOT EXISTS version_label text;

CREATE INDEX IF NOT EXISTS rider_packs_version_of_idx ON rider_packs(version_of_pack_id) WHERE version_of_pack_id IS NOT NULL;

-- The attachment relation. document_pack_id = a channel_list / stage_plot
-- pack (any version). Exactly one target: a rider pack (the rider's tech
-- section presents it), a routing row (that show's advance/packet uses it),
-- or a tour (the tour-wide default, e.g. the operations Channel list tab).
CREATE TABLE IF NOT EXISTS rider_pack_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  document_pack_id uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  rider_pack_id uuid REFERENCES rider_packs(id) ON DELETE CASCADE,
  routing_id uuid REFERENCES routing(id) ON DELETE CASCADE,
  tour_id uuid REFERENCES tours(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- exactly ONE target
  CONSTRAINT rider_pack_attachments_one_target CHECK (
    (CASE WHEN rider_pack_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN routing_id  IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN tour_id     IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT rider_pack_attachments_no_self CHECK (document_pack_id IS DISTINCT FROM rider_pack_id)
);

-- One attachment per (target, document) — app enforces one-per-KIND by
-- replacing (kind lives on rider_packs; a SQL check would need a join).
CREATE UNIQUE INDEX IF NOT EXISTS rpa_unique_rider_doc  ON rider_pack_attachments(rider_pack_id, document_pack_id) WHERE rider_pack_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rpa_unique_show_doc   ON rider_pack_attachments(routing_id,   document_pack_id) WHERE routing_id  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rpa_unique_tour_doc   ON rider_pack_attachments(tour_id,      document_pack_id) WHERE tour_id     IS NOT NULL;
CREATE INDEX IF NOT EXISTS rpa_document_idx ON rider_pack_attachments(document_pack_id);

ALTER TABLE rider_pack_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rpa_select" ON rider_pack_attachments;
CREATE POLICY "rpa_select" ON rider_pack_attachments FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS "rpa_insert" ON rider_pack_attachments;
CREATE POLICY "rpa_insert" ON rider_pack_attachments FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS "rpa_update" ON rider_pack_attachments;
CREATE POLICY "rpa_update" ON rider_pack_attachments FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());
DROP POLICY IF EXISTS "rpa_delete" ON rider_pack_attachments;
CREATE POLICY "rpa_delete" ON rider_pack_attachments FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

-- ── DOWN ──────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS rider_pack_attachments;
-- ALTER TABLE rider_packs DROP COLUMN IF EXISTS version_of_pack_id;
-- ALTER TABLE rider_packs DROP COLUMN IF EXISTS version_label;
