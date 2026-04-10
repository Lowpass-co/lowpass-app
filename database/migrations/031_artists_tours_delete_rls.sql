-- ============================================
-- LOWPASS — RLS DELETE for artists and tours
-- Migration 031
--
-- Without FOR DELETE policies, RLS blocks deletes.
-- ============================================

DROP POLICY IF EXISTS "Users can delete workspace artists" ON artists;
CREATE POLICY "Users can delete workspace artists"
  ON artists FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "Users can delete workspace tours" ON tours;
CREATE POLICY "Users can delete workspace tours"
  ON tours FOR DELETE
  USING (workspace_id = public.get_my_workspace_id());
