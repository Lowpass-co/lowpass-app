-- ============================================
-- Advance system enhancements
-- Per-section status, form templates, RLS, indexes
-- ============================================

-- 1. Per-section status tracking on advance_instances
ALTER TABLE advance_instances ADD COLUMN IF NOT EXISTS section_statuses JSONB DEFAULT '{}';
-- section_statuses: map of section_id → { status: 'not_started' | 'in_progress' | 'complete' | 'needs_review', assigned_to: UUID | null }

-- 2. Saved layout templates on advance_form_configs
ALTER TABLE advance_form_configs ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;
ALTER TABLE advance_form_configs ADD COLUMN IF NOT EXISTS template_label TEXT;
-- When is_template = true, this is a reusable layout (e.g. "Festival", "Club", "Headline")
-- template_label is the user-facing name

-- 3. Section order: existing 'sections' JSONB on advance_form_configs is an ordered array — no change needed.

-- 4. RLS policies for advance tables using get_my_workspace_id()

-- advance_form_configs: drop existing, then read/write via tour → workspace
DROP POLICY IF EXISTS "Users can view tour advance configs" ON advance_form_configs;
DROP POLICY IF EXISTS "Users can create advance configs" ON advance_form_configs;
CREATE POLICY "afc_select" ON advance_form_configs FOR SELECT
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "afc_insert" ON advance_form_configs FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "afc_update" ON advance_form_configs FOR UPDATE
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "afc_delete" ON advance_form_configs FOR DELETE
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));

-- advance_instances: drop existing, then read/write via routing → tour → workspace
DROP POLICY IF EXISTS "Users can view advance instances" ON advance_instances;
DROP POLICY IF EXISTS "Users can update advance instances" ON advance_instances;
CREATE POLICY "ai_select" ON advance_instances FOR SELECT
  USING (routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id())));
CREATE POLICY "ai_insert" ON advance_instances FOR INSERT
  WITH CHECK (routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id())));
CREATE POLICY "ai_update" ON advance_instances FOR UPDATE
  USING (routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id())));
CREATE POLICY "ai_delete" ON advance_instances FOR DELETE
  USING (routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id())));

-- advance_comments: drop existing, then read/insert via advance_instance → routing → tour → workspace
DROP POLICY IF EXISTS "Users can view advance comments" ON advance_comments;
DROP POLICY IF EXISTS "Users can create advance comments" ON advance_comments;
CREATE POLICY "ac_select" ON advance_comments FOR SELECT
  USING (advance_instance_id IN (SELECT id FROM advance_instances WHERE routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()))));
CREATE POLICY "ac_insert" ON advance_comments FOR INSERT
  WITH CHECK (advance_instance_id IN (SELECT id FROM advance_instances WHERE routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()))));

-- advance_templates: platform templates (workspace_id IS NULL) visible to all, workspace templates visible to workspace members
DROP POLICY IF EXISTS "Anyone can view platform templates" ON advance_templates;
CREATE POLICY "at_select" ON advance_templates FOR SELECT
  USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());
CREATE POLICY "at_insert" ON advance_templates FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_afc_tour ON advance_form_configs(tour_id);
CREATE INDEX IF NOT EXISTS idx_afc_routing ON advance_form_configs(routing_id);
CREATE INDEX IF NOT EXISTS idx_ai_form_config ON advance_instances(form_config_id);
