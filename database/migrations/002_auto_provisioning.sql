-- ============================================
-- LOWPASS — Auto-Provisioning Trigger
-- Migration 002
--
-- When a new user signs up via Supabase Auth,
-- automatically create:
--   1. A profile row
--   2. A workspace (named after their email)
--   3. A "Tour Manager" role with full permissions
--   4. Link the profile to the workspace + role
-- ============================================

-- Function: runs after auth.users INSERT
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_workspace_id UUID;
  new_role_id UUID;
BEGIN
  -- 1. Create workspace
  INSERT INTO public.workspaces (name, owner_id, currency)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Workspace',
    NEW.id,
    'GBP'
  )
  RETURNING id INTO new_workspace_id;

  -- 2. Create default "Tour Manager" role with all permissions
  INSERT INTO public.roles (workspace_id, name, is_god, permissions)
  VALUES (
    new_workspace_id,
    'Tour Manager',
    TRUE,
    '{
      "tours.create": true,
      "tours.edit": true,
      "tours.delete": true,
      "tours.view": true,
      "routing.create": true,
      "routing.edit": true,
      "routing.delete": true,
      "advance.view": true,
      "advance.edit": true,
      "advance.assign": true,
      "advance.lock": true,
      "personnel.create": true,
      "personnel.edit": true,
      "personnel.view_rates": true,
      "personnel.view_commission": true,
      "venues.create": true,
      "venues.edit": true,
      "budget.view": true,
      "budget.edit": true,
      "budget.approve": true,
      "workspace.manage": true,
      "workspace.invite": true,
      "workspace.roles": true
    }'::jsonb
  )
  RETURNING id INTO new_role_id;

  -- 3. Create profile linked to workspace + role
  INSERT INTO public.profiles (id, email, name, workspace_id, role_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    new_workspace_id,
    new_role_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fires after INSERT on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Also add INSERT policies so authenticated
-- users can create data in their workspace.
-- ============================================

-- Workspaces: owners can update their workspace
CREATE POLICY "Owners can update own workspace"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

-- Artists: workspace members can create
CREATE POLICY "Users can create workspace artists"
  ON artists FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update workspace artists"
  ON artists FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Tours: workspace members can create
CREATE POLICY "Users can create workspace tours"
  ON tours FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update workspace tours"
  ON tours FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Routing: via tour workspace membership
CREATE POLICY "Users can create tour routing"
  ON routing FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "Users can update tour routing"
  ON routing FOR UPDATE
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())));

-- Personnel
CREATE POLICY "Users can create workspace personnel"
  ON personnel FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update workspace personnel"
  ON personnel FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Venues
CREATE POLICY "Users can create workspace venues"
  ON venues FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update workspace venues"
  ON venues FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Advance templates: anyone can read platform templates (workspace_id IS NULL)
CREATE POLICY "Anyone can view platform templates"
  ON advance_templates FOR SELECT
  USING (workspace_id IS NULL OR workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Advance form configs
CREATE POLICY "Users can view tour advance configs"
  ON advance_form_configs FOR SELECT
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "Users can create advance configs"
  ON advance_form_configs FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())));

-- Advance instances
CREATE POLICY "Users can view advance instances"
  ON advance_instances FOR SELECT
  USING (routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))));

CREATE POLICY "Users can update advance instances"
  ON advance_instances FOR UPDATE
  USING (routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()))));

-- Advance comments
CREATE POLICY "Users can view advance comments"
  ON advance_comments FOR SELECT
  USING (advance_instance_id IN (SELECT id FROM advance_instances WHERE routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())))));

CREATE POLICY "Users can create advance comments"
  ON advance_comments FOR INSERT
  WITH CHECK (advance_instance_id IN (SELECT id FROM advance_instances WHERE routing_id IN (SELECT id FROM routing WHERE tour_id IN (SELECT id FROM tours WHERE workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())))));

-- Notifications: users can update own (mark read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());
