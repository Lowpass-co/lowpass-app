-- Schedule templates: user-wide (all tours) or tour-wide (this tour only)
-- Used by Advance Schedule section: Save as template / Load template
CREATE TABLE IF NOT EXISTS advance_schedule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  section_template_id TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_schedule_templates_workspace
  ON advance_schedule_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_advance_schedule_templates_tour
  ON advance_schedule_templates(tour_id);

COMMENT ON COLUMN advance_schedule_templates.tour_id IS 'NULL = user-wide (all tours); set = tour-wide (this tour only)';

ALTER TABLE advance_schedule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ast_select" ON advance_schedule_templates FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "ast_insert" ON advance_schedule_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "ast_delete" ON advance_schedule_templates FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());
