-- ============================================
-- LOWPASS — Personnel DELETE policy (get_my_workspace_id)
-- Migration 032
--
-- 025 used `workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())`
-- which can fail or behave inconsistently under profiles RLS. Align with other tables.
-- ============================================

DROP POLICY IF EXISTS "Users can delete workspace personnel" ON personnel;
CREATE POLICY "Users can delete workspace personnel"
  ON personnel FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());
