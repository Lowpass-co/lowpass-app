/* ============================================================
   MIGRATION 281 — file_share_links + file_share_events (Nov 2026, Adam)

   Link people to a tour file or a tour folder, view-only or edit.
     · Anyone with the link can open it (optional password, optional
       expiry, revocable). No Lowpass account needed.
     · VIEW: see + download.
     · EDIT: also upload into the folder, and upload a new version of a
       file. Never rename, move or delete. Old versions are kept
       (metadata.versions on file_references; the old storage object stays).
     · Every download / upload / new version is logged in
       file_share_events with the name the person gave.

   The PUBLIC path never touches RLS: /api/public/file-link/[token]/... resolves
   the token with the service-role client (same as show_links, migration 257).
   RLS below covers the owner side only. file_share_events has no insert
   policy on purpose — only the service role writes it.

   HAND-PASTE into the Supabase SQL editor. Idempotent — a re-run is a no-op.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.file_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL,
  -- A file link dies with its file.
  file_id UUID REFERENCES public.file_references(id) ON DELETE CASCADE,
  -- A folder link is a metadata.folder path on the tour's files ("Contracts/2026").
  folder_path TEXT,
  access TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  -- Who it's for, typed by the owner ("Live Nation settlement"). Optional.
  label TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  CONSTRAINT file_share_links_kind_chk CHECK (target_kind IN ('file', 'folder')),
  CONSTRAINT file_share_links_access_chk CHECK (access IN ('view', 'edit')),
  CONSTRAINT file_share_links_target_chk CHECK (
    (target_kind = 'file' AND file_id IS NOT NULL AND folder_path IS NULL)
    OR (target_kind = 'folder' AND file_id IS NULL AND folder_path IS NOT NULL AND length(folder_path) BETWEEN 1 AND 512)
  )
);

CREATE INDEX IF NOT EXISTS idx_file_share_links_tour ON public.file_share_links(tour_id);
CREATE INDEX IF NOT EXISTS idx_file_share_links_file ON public.file_share_links(file_id) WHERE file_id IS NOT NULL;

ALTER TABLE public.file_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_share_links_select ON public.file_share_links;
CREATE POLICY file_share_links_select ON public.file_share_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS file_share_links_insert ON public.file_share_links;
CREATE POLICY file_share_links_insert ON public.file_share_links
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND tour_id IN (SELECT t.id FROM public.tours t WHERE t.workspace_id = public.get_my_workspace_id())
  );

DROP POLICY IF EXISTS file_share_links_update ON public.file_share_links;
CREATE POLICY file_share_links_update ON public.file_share_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS file_share_links_delete ON public.file_share_links;
CREATE POLICY file_share_links_delete ON public.file_share_links
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

CREATE TABLE IF NOT EXISTS public.file_share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.file_share_links(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  file_id UUID REFERENCES public.file_references(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_name TEXT,
  file_name TEXT,
  bytes BIGINT,
  -- new_version: where the replaced object still lives, so the owner can get it back.
  previous_path TEXT,
  previous_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT file_share_events_action_chk CHECK (action IN ('download', 'upload', 'new_version'))
);

CREATE INDEX IF NOT EXISTS idx_file_share_events_link_time ON public.file_share_events(link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_share_events_tour_time ON public.file_share_events(tour_id, created_at DESC);

ALTER TABLE public.file_share_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_share_events_select ON public.file_share_events;
CREATE POLICY file_share_events_select ON public.file_share_events
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

/* ── Checks (optional) ───────────────────────────────────────
   SELECT to_regclass('public.file_share_links'), to_regclass('public.file_share_events');
   SELECT policyname FROM pg_policies WHERE tablename IN ('file_share_links','file_share_events') ORDER BY 1;
   -- expect 5 rows: file_share_events_select + 4 file_share_links_ policies */

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.file_share_events CASCADE;
   DROP TABLE IF EXISTS public.file_share_links CASCADE;
   ============================================================ */
