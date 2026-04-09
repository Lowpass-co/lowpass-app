-- ============================================================
-- Link personnel_rates (tour) → personnel (workspace roster)
-- + DELETE policy on personnel
-- Run in Supabase SQL Editor after prior migrations.
-- ============================================================

ALTER TABLE personnel_rates
  ADD COLUMN IF NOT EXISTS roster_personnel_id UUID REFERENCES personnel(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_rates_tour_roster_unique
  ON personnel_rates (tour_id, roster_personnel_id)
  WHERE roster_personnel_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can delete workspace personnel" ON personnel;
CREATE POLICY "Users can delete workspace personnel"
  ON personnel FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
