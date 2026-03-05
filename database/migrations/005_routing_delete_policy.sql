-- ============================================
-- LOWPASS — Routing DELETE policy
-- Migration 005
--
-- Allow workspace members to delete routing
-- for tours in their workspace.
-- ============================================

CREATE POLICY "Users can delete tour routing"
  ON routing FOR DELETE
  USING (tour_id IN (SELECT id FROM tours WHERE workspace_id = public.get_my_workspace_id()));
