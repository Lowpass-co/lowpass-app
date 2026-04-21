-- ============================================
-- LOWPASS — Bug Reports
-- Migration 033
--
-- Table bug_reports + storage bucket bug-reports.
-- Visible to any authenticated user in any workspace (shared triage).
-- ============================================

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),
  page_url TEXT,
  page_path TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  viewport_width INT,
  viewport_height INT,
  device_pixel_ratio NUMERIC,
  screenshot_path TEXT,
  resolution_notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON bug_reports(status);
CREATE INDEX IF NOT EXISTS bug_reports_created_at_idx ON bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_reporter_id_idx ON bug_reports(reporter_id);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all bug reports (shared triage view).
CREATE POLICY "bug_reports_select"
  ON bug_reports FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any authenticated user can submit a report (and must be the reporter).
CREATE POLICY "bug_reports_insert"
  ON bug_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

-- Any authenticated user can update triage fields (status, severity, notes).
CREATE POLICY "bug_reports_update"
  ON bug_reports FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Original reporter can delete their own report.
CREATE POLICY "bug_reports_delete"
  ON bug_reports FOR DELETE
  USING (reporter_id = auth.uid());

-- updated_at trigger
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

-- Storage bucket for screenshots (private; signed URLs on read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-reports', 'bug-reports', false)
ON CONFLICT (id) DO NOTHING;

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
