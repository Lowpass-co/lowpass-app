-- ============================================
-- LOWPASS — Fix RLS Infinite Recursion
-- Migration 004
--
-- The problem: RLS policies on all tables check
-- "workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())"
-- But profiles itself has RLS, creating infinite recursion.
--
-- The fix: Create a SECURITY DEFINER function that
-- bypasses RLS to get the user's workspace_id,
-- then use that function in all policies.
-- ============================================

-- Helper function: get current user's workspace_id
-- SECURITY DEFINER runs as the function owner (postgres),
-- bypassing RLS on the profiles table.
CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
RETURNS UUID AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Now drop and recreate all policies that had the recursion issue.

-- PROFILES: drop old policies, recreate with function
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR workspace_id = public.get_my_workspace_id());

-- WORKSPACES
DROP POLICY IF EXISTS "Users can view own workspace" ON workspaces;
CREATE POLICY "Users can view own workspace"
  ON workspaces FOR SELECT
  USING (id = public.get_my_workspace_id());

-- ROLES
DROP POLICY IF EXISTS "Users can view workspace roles" ON roles;
CREATE POLICY "Users can view workspace roles"
  ON roles FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

-- ARTISTS
DROP POLICY IF EXISTS "Users can view workspace artists" ON artists;
DROP POLICY IF EXISTS "Users can create workspace artists" ON artists;
DROP POLICY IF EXISTS "Users can update workspace artists" ON artists;

CREATE POLICY "Users can view workspace artists"
  ON artists FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can create workspace artists"
  ON artists FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can update workspace artists"
  ON artists FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());

-- TOURS
DROP POLICY IF EXISTS "Users can view workspace tours" ON tours;
DROP POLICY IF EXISTS "Users can create workspace tours" ON tours;
DROP POLICY IF EXISTS "Users can update workspace tours" ON tours;

CREATE POLICY "Users can view workspace tours"
  ON tours FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can create workspace tours"
  ON tours FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can update workspace tours"
  ON tours FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());

-- ROUTING (needs join through tours)
DROP POLICY IF EXISTS "Users can view tour routing" ON routing;
DROP POLICY IF EXISTS "Users can create tour routing" ON routing;
DROP POLICY IF EXISTS "Users can update tour routing" ON routing;

CREATE POLICY "Users can view tour routing"
  ON routing FOR SELECT
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));

CREATE POLICY "Users can create tour routing"
  ON routing FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));

CREATE POLICY "Users can update tour routing"
  ON routing FOR UPDATE
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));

-- PERSONNEL
DROP POLICY IF EXISTS "Users can view workspace personnel" ON personnel;
DROP POLICY IF EXISTS "Users can create workspace personnel" ON personnel;
DROP POLICY IF EXISTS "Users can update workspace personnel" ON personnel;

CREATE POLICY "Users can view workspace personnel"
  ON personnel FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can create workspace personnel"
  ON personnel FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can update workspace personnel"
  ON personnel FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());

-- VENUES
DROP POLICY IF EXISTS "Users can view workspace venues" ON venues;
DROP POLICY IF EXISTS "Users can create workspace venues" ON venues;
DROP POLICY IF EXISTS "Users can update workspace venues" ON venues;

CREATE POLICY "Users can view workspace venues"
  ON venues FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can create workspace venues"
  ON venues FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "Users can update workspace venues"
  ON venues FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id());

-- ADVANCE TEMPLATES (platform templates have NULL workspace_id)
DROP POLICY IF EXISTS "Anyone can view platform templates" ON advance_templates;
CREATE POLICY "Anyone can view platform templates"
  ON advance_templates FOR SELECT
  USING (workspace_id IS NULL OR workspace_id = public.get_my_workspace_id());

-- ADVANCE FORM CONFIGS
DROP POLICY IF EXISTS "Users can view tour advance configs" ON advance_form_configs;
DROP POLICY IF EXISTS "Users can create advance configs" ON advance_form_configs;

CREATE POLICY "Users can view tour advance configs"
  ON advance_form_configs FOR SELECT
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));

CREATE POLICY "Users can create advance configs"
  ON advance_form_configs FOR INSERT
  WITH CHECK (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));

-- ADVANCE INSTANCES
DROP POLICY IF EXISTS "Users can view advance instances" ON advance_instances;
DROP POLICY IF EXISTS "Users can update advance instances" ON advance_instances;

CREATE POLICY "Users can view advance instances"
  ON advance_instances FOR SELECT
  USING (routing_id IN (
    SELECT r.id FROM routing r
    JOIN tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));

CREATE POLICY "Users can update advance instances"
  ON advance_instances FOR UPDATE
  USING (routing_id IN (
    SELECT r.id FROM routing r
    JOIN tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));

-- ADVANCE COMMENTS
DROP POLICY IF EXISTS "Users can view advance comments" ON advance_comments;
DROP POLICY IF EXISTS "Users can create advance comments" ON advance_comments;

CREATE POLICY "Users can view advance comments"
  ON advance_comments FOR SELECT
  USING (advance_instance_id IN (
    SELECT ai.id FROM advance_instances ai
    JOIN routing r ON ai.routing_id = r.id
    JOIN tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));

CREATE POLICY "Users can create advance comments"
  ON advance_comments FOR INSERT
  WITH CHECK (advance_instance_id IN (
    SELECT ai.id FROM advance_instances ai
    JOIN routing r ON ai.routing_id = r.id
    JOIN tours t ON r.tour_id = t.id
    WHERE t.workspace_id = public.get_my_workspace_id()
  ));

-- WORKSPACES update policy
DROP POLICY IF EXISTS "Owners can update own workspace" ON workspaces;
CREATE POLICY "Owners can update own workspace"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());
