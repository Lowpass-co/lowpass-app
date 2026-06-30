-- ============================================
-- LOWPASS — export-assets storage bucket (#8 Document Export, Template Builder P2)
-- Migration 223
-- ============================================
--
-- A PRIVATE bucket for export-template images: the header background photo and an
-- uploaded header logo (the daysheets faded-header look). Private — not public —
-- because these are workspace-branding assets and the render fetches them
-- server-side (createServerSupabaseClient → download → base64 data-URI in
-- src/lib/export/logo.ts fetchExportAssetDataUri). A private bucket is fine: the
-- server reads the bytes; the browser never needs a URL.
--
-- Object path: {workspace_id}/{uuid}.{ext}. Every policy scopes the FIRST folder
-- segment to the caller's workspace via public.get_my_workspace_id(), so a member
-- can only read/write their own workspace's assets — no cross-workspace leak
-- (mirrors the workspace-scoping convention; the artist-assets bucket scopes by
-- auth.uid(), but export assets are workspace-shared branding, so we scope by
-- workspace_id to match the template system's sharing model).
--
-- Idempotent — bucket via ON CONFLICT, policies dropped-by-name before create.
-- Recorded in public._lp_migrations on apply.
-- ============================================

-- Private bucket (public = false).
INSERT INTO storage.buckets (id, name, public)
VALUES ('export-assets', 'export-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Read own-workspace assets (the export render + the editor preview).
DROP POLICY IF EXISTS "export_assets_select_own_ws" ON storage.objects;
CREATE POLICY "export_assets_select_own_ws"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'export-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
);

-- Upload into own-workspace folder only.
DROP POLICY IF EXISTS "export_assets_insert_own_ws" ON storage.objects;
CREATE POLICY "export_assets_insert_own_ws"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'export-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
);

-- Overwrite/replace own-workspace assets.
DROP POLICY IF EXISTS "export_assets_update_own_ws" ON storage.objects;
CREATE POLICY "export_assets_update_own_ws"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'export-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
);

-- Delete own-workspace assets.
DROP POLICY IF EXISTS "export_assets_delete_own_ws" ON storage.objects;
CREATE POLICY "export_assets_delete_own_ws"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'export-assets'
  AND (storage.foldername(name))[1] = public.get_my_workspace_id()::text
);

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP POLICY IF EXISTS "export_assets_select_own_ws" ON storage.objects;
   DROP POLICY IF EXISTS "export_assets_insert_own_ws" ON storage.objects;
   DROP POLICY IF EXISTS "export_assets_update_own_ws" ON storage.objects;
   DROP POLICY IF EXISTS "export_assets_delete_own_ws" ON storage.objects;
   DELETE FROM storage.buckets WHERE id = 'export-assets';
   ============================================================ */
