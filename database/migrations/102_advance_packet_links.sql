/* ============================================================
   MIGRATION 102 — advance_packet_links (Sprint 12 §11)

   Workspace-scoped share table for the new Advance Packet
   view at /advance/[tourId]/[routingId]/packet. Each row is
   one public link that resolves to a packet manifest (riders +
   channel lists + rental jobs + assets for a tour + optional
   routing).

   Schema note vs §11 handover spec: the spec SQL referenced
   `public.tour_routing(id)` but this codebase's routing table
   is `public.routing` (see migration 001). routing_id below
   references public.routing(id); behaviour identical.

   Idempotent — safe to re-run.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.advance_packet_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  /* NULL means "whole-tour packet" (no per-show scoping).
     §11a URL routing forces a routing id at the route level,
     but the schema allows tour-wide packets for a future
     toggle. */
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

/* Canonical workspace RLS — get_my_workspace_id / is_workspace_admin
   defined in migrations 004 + 011. Idempotent via DROP ... IF EXISTS
   before each CREATE so re-running this migration after a
   policy tweak doesn't error. */
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

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.advance_packet_links CASCADE;
   ============================================================ */
