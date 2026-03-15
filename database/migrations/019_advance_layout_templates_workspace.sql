-- Workspace-scoped advance layout templates (no tour required)
-- Used when "Save as template" is used before the advance is saved
CREATE TABLE IF NOT EXISTS advance_layout_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_layout_templates_workspace ON advance_layout_templates(workspace_id);

ALTER TABLE advance_layout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alt_select" ON advance_layout_templates FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "alt_insert" ON advance_layout_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "alt_update" ON advance_layout_templates FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "alt_delete" ON advance_layout_templates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());
