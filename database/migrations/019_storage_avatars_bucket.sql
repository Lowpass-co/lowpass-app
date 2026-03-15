-- LOWPASS — Storage bucket for profile avatars.
-- Create bucket "avatars" in Supabase Dashboard → Storage (Public ON) if not exists.

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);
