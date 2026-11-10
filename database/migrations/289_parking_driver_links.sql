/* ============================================================
   MIGRATION 289 — driver links for parking maps (Nov 2026, Adam)

   "a link to drivers that is unique and only lasts a short while, but
   enables them to navigate the 3D map" — without high costs.

   One row per link: a show's parking map, sent to a driver.
     token_hash     sha-256 of the token; the token itself is shown to the
                    person making the link ONCE and never stored, so a read
                    of this table can't open anyone's map
     expires_at     required: every link ends (48 h by default)
     revoked_at     turned off early
     max_3d_opens / opens_3d
                    each open of the 3D view is a billed Google session
                    (photorealistic 3D tiles, ~0.6 ¢ after the free 1,000 a
                    month); a link can open 3D only this many times
     views          plan views (free 2D tiles), for the owner's list

   parking_share_touch() is the ONE way a public request uses a link: it
   counts the view, or TAKES a 3D open, atomically — the cap can't be
   passed by two phones at once — and returns the row either way with
   `took` saying whether it counted. Only the service role (the public
   API route) may call it.

   HAND-PASTE into the Supabase SQL editor. Idempotent: a re-run is a no-op.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.parking_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  max_3d_opens INTEGER NOT NULL DEFAULT 20,
  opens_3d INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parking_share_links_hash_chk CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT parking_share_links_label_chk CHECK (label IS NULL OR char_length(label) <= 60),
  CONSTRAINT parking_share_links_opens_chk CHECK (max_3d_opens BETWEEN 0 AND 100 AND opens_3d >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS parking_share_links_hash_idx ON public.parking_share_links (token_hash);
CREATE INDEX IF NOT EXISTS parking_share_links_routing_idx ON public.parking_share_links (routing_id, created_at DESC);

ALTER TABLE public.parking_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_share_links_select ON public.parking_share_links;
CREATE POLICY parking_share_links_select ON public.parking_share_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS parking_share_links_insert ON public.parking_share_links;
CREATE POLICY parking_share_links_insert ON public.parking_share_links
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND tour_id IN (SELECT t.id FROM public.tours t WHERE t.workspace_id = public.get_my_workspace_id())
    AND routing_id IN (SELECT r.id FROM public.routing r WHERE r.tour_id = parking_share_links.tour_id)
  );

DROP POLICY IF EXISTS parking_share_links_update ON public.parking_share_links;
CREATE POLICY parking_share_links_update ON public.parking_share_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS parking_share_links_delete ON public.parking_share_links;
CREATE POLICY parking_share_links_delete ON public.parking_share_links
  FOR DELETE USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

CREATE OR REPLACE FUNCTION public.parking_share_touch(p_token_hash TEXT, p_take_3d BOOLEAN)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  tour_id UUID,
  routing_id UUID,
  label TEXT,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  max_3d_opens INTEGER,
  opens_3d INTEGER,
  views INTEGER,
  took BOOLEAN
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH hit AS (
    UPDATE public.parking_share_links l
    SET views = l.views + CASE WHEN p_take_3d THEN 0 ELSE 1 END,
        opens_3d = l.opens_3d + CASE WHEN p_take_3d THEN 1 ELSE 0 END,
        last_viewed_at = now()
    WHERE l.token_hash = p_token_hash
      AND l.revoked_at IS NULL
      AND l.expires_at > now()
      AND (NOT p_take_3d OR l.opens_3d < l.max_3d_opens)
    RETURNING l.id, l.workspace_id, l.tour_id, l.routing_id, l.label, l.expires_at, l.revoked_at, l.max_3d_opens, l.opens_3d, l.views
  )
  SELECT h.id, h.workspace_id, h.tour_id, h.routing_id, h.label, h.expires_at, h.revoked_at, h.max_3d_opens, h.opens_3d, h.views, TRUE FROM hit h
  UNION ALL
  SELECT l.id, l.workspace_id, l.tour_id, l.routing_id, l.label, l.expires_at, l.revoked_at, l.max_3d_opens, l.opens_3d, l.views, FALSE
  FROM public.parking_share_links l
  WHERE l.token_hash = p_token_hash AND NOT EXISTS (SELECT 1 FROM hit);
END;
$$;

REVOKE ALL ON FUNCTION public.parking_share_touch(TEXT, BOOLEAN) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.parking_share_touch(TEXT, BOOLEAN) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.parking_share_touch(TEXT, BOOLEAN) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.parking_share_touch(TEXT, BOOLEAN) TO service_role;
  END IF;
END $$;

/* ── Checks (optional) ───────────────────────────────────────
   SELECT to_regclass('public.parking_share_links');
   SELECT policyname FROM pg_policies WHERE tablename = 'parking_share_links' ORDER BY 1;
   -- expect 4 rows */

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP FUNCTION IF EXISTS public.parking_share_touch(TEXT, BOOLEAN);
   DROP TABLE IF EXISTS public.parking_share_links;
   ============================================================ */
