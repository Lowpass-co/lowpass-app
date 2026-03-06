-- ============================================
-- LOWPASS — Advance Files Storage
-- Migration 016
--
-- Bucket and RLS for advance form file uploads
-- (PDF, images) stored per workspace/instance/field.
-- ============================================

-- Create the advance-files bucket (run via Supabase dashboard if preferred, or):
INSERT INTO storage.buckets (id, name, public) VALUES ('advance-files', 'advance-files', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "advance_files_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'advance-files');

CREATE POLICY "advance_files_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'advance-files' AND (auth.uid() IS NOT NULL));

CREATE POLICY "advance_files_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'advance-files' AND (auth.uid() IS NOT NULL));
