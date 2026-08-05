/* ============================================================
   MIGRATION 257 — show_links (rider decouple phase B4)

   ONE venue-facing URL per show: /s/[token] presents the advance
   form + rider + channel list + stage plot + downloads on one
   page. Over time this replaces the four token mechanisms
   (rider_web_links, advance_packet_links, advance_intake_links,
   HMAC advance share) — all four KEEP WORKING; this table only
   adds the unified front door.

   Mirrors advance_packet_links (102) except routing_id is
   NOT NULL: a show link is per-show by definition (the tour-wide
   case is the packet link's job).

   HAND-PASTE into the Supabase SQL editor. Idempotent — a
   re-run is a no-op.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.show_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  last_viewer_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_show_links_token
  ON public.show_links(token);
CREATE INDEX IF NOT EXISTS idx_show_links_routing
  ON public.show_links(routing_id);
CREATE INDEX IF NOT EXISTS idx_show_links_tour
  ON public.show_links(tour_id);

ALTER TABLE public.show_links ENABLE ROW LEVEL SECURITY;

/* Canonical workspace RLS (get_my_workspace_id / is_workspace_admin —
   migrations 004 + 011). DROP-then-CREATE so a policy tweak re-runs
   clean. The PUBLIC read path never touches RLS: /api/public/show-link
   resolves the token with the service-role client, exactly like the
   packet + rider share endpoints. */
DROP POLICY IF EXISTS show_links_select ON public.show_links;
CREATE POLICY show_links_select ON public.show_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS show_links_insert ON public.show_links;
CREATE POLICY show_links_insert ON public.show_links
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS show_links_update ON public.show_links;
CREATE POLICY show_links_update ON public.show_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS show_links_delete ON public.show_links;
CREATE POLICY show_links_delete ON public.show_links
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.show_links CASCADE;
   ============================================================ */
