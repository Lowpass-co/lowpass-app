-- ============================================
-- LOWPASS — Personnel roster file uploads
-- (head shot, passport scans) → bucket personnel-files
-- Paths: {workspace_id}/{personnel_id}/head-shot-*.ext | passport-*.ext
-- ============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('personnel-files', 'personnel-files', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "personnel_files_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'personnel-files');

CREATE POLICY "personnel_files_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'personnel-files' AND (auth.uid() IS NOT NULL));

CREATE POLICY "personnel_files_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'personnel-files' AND (auth.uid() IS NOT NULL));

CREATE POLICY "personnel_files_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'personnel-files' AND (auth.uid() IS NOT NULL));
