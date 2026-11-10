/* ============================================================
   MIGRATION 287 — parking_maps (Nov 2026, Adam)

   One parking map per show (routing row): an overhead plan pinned to real
   coordinates, with buses, trucks, markers, routes and areas at true size.
   Lives on the show's advance (/advance/[tourId]/[routingId]/parking).

     anchor_lat / anchor_lng  the fixed point every item is measured from
                              (normally the venue). Items are METRES east /
                              north of it, so sizes are true at any zoom and
                              the 3D page (phase 2) reuses them unchanged.
     view                     where the map was left: { cx, cy, ppm, rotation }
     items                    the drawing — written ONLY through
                              parseMapBody() (src/lib/parking/model.ts)
     notes                    free text printed on the PDF
     version                  optimistic lock: a save names the version it
                              edited; a stale one gets 409, never a silent
                              overwrite of someone else's edit
     canonical_venue_id       kept so a later map at the same venue can
                              start from this one (phase 3)
     pdf_file_id              the last exported PDF in tour Files

   Imagery is never stored — Google's terms forbid caching it.

   HAND-PASTE into the Supabase SQL editor. Idempotent — a re-run is a no-op.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.parking_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  canonical_venue_id UUID REFERENCES public.canonical_venues(id) ON DELETE SET NULL,
  anchor_lat DOUBLE PRECISION NOT NULL,
  anchor_lng DOUBLE PRECISION NOT NULL,
  view JSONB NOT NULL DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  pdf_file_id UUID REFERENCES public.file_references(id) ON DELETE SET NULL,
  pdf_exported_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parking_maps_one_per_show UNIQUE (routing_id),
  CONSTRAINT parking_maps_anchor_chk CHECK (anchor_lat BETWEEN -85 AND 85 AND anchor_lng BETWEEN -180 AND 180),
  CONSTRAINT parking_maps_items_chk CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT parking_maps_view_chk CHECK (jsonb_typeof(view) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_parking_maps_tour ON public.parking_maps(workspace_id, tour_id);
CREATE INDEX IF NOT EXISTS idx_parking_maps_venue ON public.parking_maps(workspace_id, canonical_venue_id);

ALTER TABLE public.parking_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_maps_select ON public.parking_maps;
CREATE POLICY parking_maps_select ON public.parking_maps
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

-- A row must point at a show on a tour in the caller's workspace — the
-- tour and routing ids are checked here, not trusted from the client.
DROP POLICY IF EXISTS parking_maps_insert ON public.parking_maps;
CREATE POLICY parking_maps_insert ON public.parking_maps
  FOR INSERT WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND EXISTS (
      SELECT 1 FROM public.routing r JOIN public.tours t ON t.id = r.tour_id
      WHERE r.id = routing_id AND r.tour_id = parking_maps.tour_id AND t.workspace_id = public.get_my_workspace_id()
    )
  );

DROP POLICY IF EXISTS parking_maps_update ON public.parking_maps;
CREATE POLICY parking_maps_update ON public.parking_maps
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (
    workspace_id = public.get_my_workspace_id()
    AND EXISTS (
      SELECT 1 FROM public.routing r JOIN public.tours t ON t.id = r.tour_id
      WHERE r.id = routing_id AND r.tour_id = parking_maps.tour_id AND t.workspace_id = public.get_my_workspace_id()
    )
  );

DROP POLICY IF EXISTS parking_maps_delete ON public.parking_maps;
CREATE POLICY parking_maps_delete ON public.parking_maps
  FOR DELETE USING (workspace_id = public.get_my_workspace_id());

/* ── Checks (optional) ───────────────────────────────────────
   SELECT to_regclass('public.parking_maps');
   SELECT policyname FROM pg_policies WHERE tablename = 'parking_maps' ORDER BY 1;
   -- expect 4 rows */

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.parking_maps;
   ============================================================ */
