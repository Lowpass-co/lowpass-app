-- ============================================
-- LOWPASS — Bug Reports reconcile
-- Migration 035
--
-- 001_initial_schema.sql created an early bug_reports table with columns
-- reported_by_id, priority, status={new,triaged,in_progress,resolved,closed}
-- and no environment fields.
--
-- 033_bug_reports.sql tried to create the "full" schema but used
-- CREATE TABLE IF NOT EXISTS, so in any environment where 001 already ran it
-- was a no-op — and the POST /api/bug-reports route started failing with
-- "Could not find the 'browser' column of 'bug_reports' in the schema cache".
--
-- This migration brings whatever shape is currently in prod forward to the
-- 033 target shape. Idempotent: safe to re-run. No data loss — existing rows
-- are preserved and their status/severity values are remapped where needed.
-- ============================================

-- ============================================
-- 1. Column renames (only if legacy column exists and new one doesn't)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'bug_reports'
               AND column_name = 'reported_by_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'bug_reports'
                       AND column_name = 'reporter_id') THEN
    ALTER TABLE bug_reports RENAME COLUMN reported_by_id TO reporter_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'bug_reports'
               AND column_name = 'priority')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'bug_reports'
                       AND column_name = 'severity') THEN
    ALTER TABLE bug_reports RENAME COLUMN priority TO severity;
  END IF;
END $$;

-- ============================================
-- 2. Loosen constraints that 001 set but 033 doesn't want
-- ============================================

ALTER TABLE bug_reports ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE bug_reports ALTER COLUMN reporter_id  DROP NOT NULL;
ALTER TABLE bug_reports ALTER COLUMN title        DROP NOT NULL;

-- 001 defaulted description to ''; 033 has no default and requires a value.
-- We keep the DEFAULT as a convenience so historical inserts that omitted it
-- still succeeded; new inserts via the API always provide a value.
ALTER TABLE bug_reports ALTER COLUMN description SET DEFAULT '';

-- ============================================
-- 3. Add missing environment / triage columns (idempotent)
-- ============================================

ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS page_url           TEXT,
  ADD COLUMN IF NOT EXISTS page_path          TEXT,
  ADD COLUMN IF NOT EXISTS user_agent         TEXT,
  ADD COLUMN IF NOT EXISTS browser            TEXT,
  ADD COLUMN IF NOT EXISTS os                 TEXT,
  ADD COLUMN IF NOT EXISTS viewport_width     INT,
  ADD COLUMN IF NOT EXISTS viewport_height    INT,
  ADD COLUMN IF NOT EXISTS device_pixel_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS screenshot_path    TEXT,
  ADD COLUMN IF NOT EXISTS resolution_notes   TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at        TIMESTAMPTZ;

-- ============================================
-- 4. Make sure reporter_id has the FK 033 wants
--    (001 declared the column as a bare UUID — no FK.)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bug_reports'::regclass
      AND contype = 'f'
      AND conname = 'bug_reports_reporter_id_fkey'
  ) THEN
    ALTER TABLE bug_reports
      ADD CONSTRAINT bug_reports_reporter_id_fkey
      FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 5. Remap legacy status/severity values, then add CHECK constraints
-- ============================================

-- Map 001's status set {new, triaged, in_progress, resolved, closed}
-- to 033's set {open, in_progress, resolved, wont_fix, duplicate}.
UPDATE bug_reports SET status = 'open'     WHERE status IN ('new', 'triaged');
UPDATE bug_reports SET status = 'resolved' WHERE status = 'closed';
UPDATE bug_reports SET status = 'open'
  WHERE status NOT IN ('open', 'in_progress', 'resolved', 'wont_fix', 'duplicate');

-- 001's priority defaulted to 'medium' and had no CHECK. 033's severity uses
-- the same four values (low/medium/high/critical); remap anything else.
UPDATE bug_reports SET severity = 'medium'
  WHERE severity IS NULL
     OR severity NOT IN ('low', 'medium', 'high', 'critical');

-- Set 033's defaults.
ALTER TABLE bug_reports ALTER COLUMN status   SET DEFAULT 'open';
ALTER TABLE bug_reports ALTER COLUMN severity SET DEFAULT 'medium';

-- Drop any stale named/auto-named CHECK constraints we might be replacing,
-- then add the ones 033 wants with stable names.
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_priority_check;
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_severity_check;
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;

ALTER TABLE bug_reports
  ADD CONSTRAINT bug_reports_severity_check
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE bug_reports
  ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix', 'duplicate'));

-- ============================================
-- 6. Indexes (idempotent)
-- ============================================

CREATE INDEX IF NOT EXISTS bug_reports_status_idx      ON bug_reports(status);
CREATE INDEX IF NOT EXISTS bug_reports_created_at_idx  ON bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_reporter_id_idx ON bug_reports(reporter_id);

-- ============================================
-- 7. RLS + policies (drop-and-recreate so a partial 033 lands cleanly)
-- ============================================

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_reports_select" ON bug_reports;
DROP POLICY IF EXISTS "bug_reports_insert" ON bug_reports;
DROP POLICY IF EXISTS "bug_reports_update" ON bug_reports;
DROP POLICY IF EXISTS "bug_reports_delete" ON bug_reports;

CREATE POLICY "bug_reports_select"
  ON bug_reports FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_insert"
  ON bug_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

CREATE POLICY "bug_reports_update"
  ON bug_reports FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_delete"
  ON bug_reports FOR DELETE
  USING (reporter_id = auth.uid());

-- ============================================
-- 8. updated_at trigger (idempotent)
-- ============================================

CREATE OR REPLACE FUNCTION bug_reports_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bug_reports_updated_at ON bug_reports;
CREATE TRIGGER bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION bug_reports_set_updated_at();

-- ============================================
-- 9. Storage bucket + policies (idempotent)
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-reports', 'bug-reports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "bug_reports_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "bug_reports_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "bug_reports_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "bug_reports_storage_delete" ON storage.objects;

CREATE POLICY "bug_reports_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bug-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bug-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'bug-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "bug_reports_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'bug-reports' AND auth.uid() IS NOT NULL);

-- ============================================
-- 10. Nudge PostgREST to reload its schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';
