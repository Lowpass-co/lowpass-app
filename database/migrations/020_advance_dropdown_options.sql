-- User-wide (workspace) dropdown options for advance "add your own option" fields
-- e.g. catering_buyout, rider_status, meal_type
CREATE TABLE IF NOT EXISTS advance_dropdown_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_dropdown_options_workspace_kind
  ON advance_dropdown_options(workspace_id, kind);

ALTER TABLE advance_dropdown_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ado_select" ON advance_dropdown_options FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "ado_insert" ON advance_dropdown_options FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());
CREATE POLICY "ado_update" ON advance_dropdown_options FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());
CREATE POLICY "ado_delete" ON advance_dropdown_options FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());
