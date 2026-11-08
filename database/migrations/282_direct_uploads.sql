/* ============================================================
   MIGRATION 282 — direct-to-storage uploads (Nov 2026, Adam)

   Files (tour + artist) and share-link uploads no longer pass through a
   Vercel function (which refuses bodies over ~4.5 MB). The browser asks the
   app for a one-time signed upload; the app records that grant here, the
   browser uploads straight to Storage (resumable above 6 MB), then tells the
   app it's done.

   storage_upload_grants does three jobs:
     · the "finish" step only accepts a path the app granted;
     · a share link's hourly cap counts GRANTS, so asking for upload URLs and
       never finishing can't get round it;
     · a daily sweep (/api/cron/upload-sweep) deletes objects whose grant
       never completed within 24 h, then the grant.
   Only the service role reads or writes it (RLS on, no policies).

   Also sets the tour-files bucket's own limit to 100 MB. NOTE: the Supabase
   project's global "Upload file size limit" (Dashboard → Storage → Settings)
   still caps every bucket — 50 MB on the Free plan. Raise it on Pro.

   HAND-PASTE into the Supabase SQL editor. Idempotent — a re-run is a no-op.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.storage_upload_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  -- Set for uploads through a share link (counts toward its hourly cap).
  link_id UUID REFERENCES public.file_share_links(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  declared_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT storage_upload_grants_size_chk CHECK (declared_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_upload_grants_link_time ON public.storage_upload_grants(link_id, created_at DESC) WHERE link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upload_grants_open ON public.storage_upload_grants(created_at) WHERE completed_at IS NULL;

ALTER TABLE public.storage_upload_grants ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (server) touches this table.

-- The tour-files bucket's own cap: 100 MB per file (Adam, Nov 2026).
UPDATE storage.buckets
   SET file_size_limit = 104857600
 WHERE id = 'tour-files'
   AND file_size_limit IS DISTINCT FROM 104857600;

/* ── Checks (optional) ───────────────────────────────────────
   SELECT to_regclass('public.storage_upload_grants');
   SELECT id, file_size_limit FROM storage.buckets WHERE id = 'tour-files';
   -- expect 104857600 */

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.storage_upload_grants;
   UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'tour-files';
   ============================================================ */
