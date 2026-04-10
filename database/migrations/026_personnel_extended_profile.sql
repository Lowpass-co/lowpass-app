-- ============================================================
-- Rich personnel fields (JSONB) for roster / touring paperwork.
-- Run in Supabase after 025_personnel_roster_link.sql.
-- ============================================================

ALTER TABLE personnel
  ADD COLUMN IF NOT EXISTS extended_profile JSONB NOT NULL DEFAULT '{}';
