/* ============================================
   Migration 094 — rental_movements scan audit log (Sprint 12 §1 / §3)

   Append-only log of every scan-in / scan-out / repair-flag /
   loss-flag / manual-correction action on a rental_inventory
   item. Powers the "Last scanned by / when / where" column on
   the job-level gear view (§4) and the per-item movement
   history when the operator drills in.

   Workspace-scoped via direct workspace_id (the canonical
   pattern). Items + jobs are FK'd with appropriate cascade /
   set-null semantics:

     - rental_inventory_id  ON DELETE CASCADE
       (movements only exist while the item does)
     - rental_job_id        ON DELETE SET NULL
       (movements survive job deletion as historical record)
     - scanned_by_user_id   ON DELETE SET NULL
       (movements survive user deletion as historical record)

   Apply via: npm run db:migrate
   ============================================ */

CREATE TABLE IF NOT EXISTS public.rental_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rental_inventory_id UUID NOT NULL REFERENCES public.rental_inventory(id) ON DELETE CASCADE,
  rental_job_id UUID REFERENCES public.rental_jobs(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('scan_out', 'scan_in', 'mark_repair', 'mark_lost', 'manual_correction')),
  scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_movements_item_idx
  ON public.rental_movements (rental_inventory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rental_movements_job_idx
  ON public.rental_movements (rental_job_id, created_at DESC)
  WHERE rental_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rental_movements_workspace_idx
  ON public.rental_movements (workspace_id, created_at DESC);

ALTER TABLE public.rental_movements ENABLE ROW LEVEL SECURITY;

/* Canonical workspace-only RLS (matches the pattern the rest of
   rental_* moves to in 095). DELETE is admin-gated even though
   movement entries are append-only — operators shouldn't be
   purging historical records casually. */
DROP POLICY IF EXISTS rental_movements_select ON public.rental_movements;
CREATE POLICY rental_movements_select ON public.rental_movements
  FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rental_movements_insert ON public.rental_movements;
CREATE POLICY rental_movements_insert ON public.rental_movements
  FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rental_movements_update ON public.rental_movements;
CREATE POLICY rental_movements_update ON public.rental_movements
  FOR UPDATE
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS rental_movements_delete ON public.rental_movements;
CREATE POLICY rental_movements_delete ON public.rental_movements
  FOR DELETE
  USING (workspace_id = public.get_my_workspace_id() AND public.is_workspace_admin());

/* ============================================
   Down migration
   ============================================ */
-- DROP POLICY IF EXISTS rental_movements_delete ON public.rental_movements;
-- DROP POLICY IF EXISTS rental_movements_update ON public.rental_movements;
-- DROP POLICY IF EXISTS rental_movements_insert ON public.rental_movements;
-- DROP POLICY IF EXISTS rental_movements_select ON public.rental_movements;
-- DROP INDEX IF EXISTS rental_movements_workspace_idx;
-- DROP INDEX IF EXISTS rental_movements_job_idx;
-- DROP INDEX IF EXISTS rental_movements_item_idx;
-- DROP TABLE IF EXISTS public.rental_movements;
