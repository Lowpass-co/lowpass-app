/* ============================================================
   MIGRATION 107 — advance_intake_links (Advance redesign T3)

   The "Send Packet" venue-intake flow. Distinct from migration
   102's advance_packet_links, which is a READ-ONLY share of the
   packet manifest. An intake link is a WRITE surface: the tour
   manager generates a token, sends it to the venue, and the venue
   fills the requested advance fields on a public form. On submit,
   the raw answers land in submitted_data and are merged back into
   the show's advance_instances.data.

   One row = one outstanding/used intake request for a single show
   (routing_id is NOT NULL — intake is always per-show, unlike a
   tour-wide packet). advance_instance_id is the write-back target;
   ON DELETE SET NULL so deleting the instance doesn't orphan-block.

   Idempotent — safe to re-run.
   ============================================================ */

CREATE TABLE IF NOT EXISTS public.advance_intake_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.routing(id) ON DELETE CASCADE,
  /* Write-back target. NULL-able so an instance delete doesn't block;
     the public submit route re-resolves the instance by routing_id if
     this is null. */
  advance_instance_id UUID REFERENCES public.advance_instances(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  /* Optional addressing — who the link was generated for. The send
     itself is manual (copy link) in T3; recipient_* lets a later
     tranche email the venue + show "sent to X" in the UI. */
  recipient_name TEXT,
  recipient_email TEXT,
  /* pending → submitted (venue filled it) ; revoked (TM killed it).
     'expired' is derived from expires_at at read time, not stored. */
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'revoked')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  submitted_by_name TEXT,
  submitted_by_email TEXT,
  /* Raw venue answers, keyed { section_template_id: { field_id: value } }
     — same shape as advance_instances.data so the merge is a deep spread.
     Retained even after merge for an audit trail of what the venue sent. */
  submitted_data JSONB,
  last_viewed_at TIMESTAMPTZ,
  last_viewer_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_advance_intake_links_token
  ON public.advance_intake_links(token);
CREATE INDEX IF NOT EXISTS idx_advance_intake_links_tour
  ON public.advance_intake_links(tour_id, routing_id);
CREATE INDEX IF NOT EXISTS idx_advance_intake_links_status
  ON public.advance_intake_links(workspace_id, status);

ALTER TABLE public.advance_intake_links ENABLE ROW LEVEL SECURITY;

/* Canonical workspace RLS — get_my_workspace_id / is_workspace_admin
   defined in migrations 004 + 011. Public (venue) access never uses
   these policies: the public intake routes use the service-role client
   and resolve strictly by token. Idempotent via DROP ... IF EXISTS. */
DROP POLICY IF EXISTS advance_intake_links_select ON public.advance_intake_links;
CREATE POLICY advance_intake_links_select ON public.advance_intake_links
  FOR SELECT USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS advance_intake_links_insert ON public.advance_intake_links;
CREATE POLICY advance_intake_links_insert ON public.advance_intake_links
  FOR INSERT WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS advance_intake_links_update ON public.advance_intake_links;
CREATE POLICY advance_intake_links_update ON public.advance_intake_links
  FOR UPDATE USING (workspace_id = public.get_my_workspace_id())
    WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS advance_intake_links_delete ON public.advance_intake_links;
CREATE POLICY advance_intake_links_delete ON public.advance_intake_links
  FOR DELETE USING (
    workspace_id = public.get_my_workspace_id()
    AND public.is_workspace_admin()
  );

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   DROP TABLE IF EXISTS public.advance_intake_links CASCADE;
   ============================================================ */
