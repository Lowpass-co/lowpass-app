/* ============================================================
   APPLY 102 in Supabase SQL Editor (Sprint 12 §11)

   Creates advance_packet_links + workspace RLS policies for
   the Advance Packet share-link feature.

   Schema note: spec said tour_routing; our table is routing.

   Idempotent. Safe to re-run.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.advance_packet_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID REFERENCES public.routing(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  last_viewer_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_advance_packet_links_token
  ON public.advance_packet_links(token);
CREATE INDEX IF NOT EXISTS idx_advance_packet_links_tour
  ON public.advance_packet_links(tour_id, routing_id);

ALTER TABLE public.advance_packet_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS advance_packet_links_select ON public.advance_packet_links;
CREATE POLICY advance_packet_links_select ON public.advance_packet_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS advance_packet_links_insert ON public.advance_packet_links;
CREATE POLICY advance_packet_links_insert ON public.advance_packet_links
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS advance_packet_links_update ON public.advance_packet_links;
CREATE POLICY advance_packet_links_update ON public.advance_packet_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS advance_packet_links_delete ON public.advance_packet_links;
CREATE POLICY advance_packet_links_delete ON public.advance_packet_links
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );
