-- ============================================
-- LOWPASS — Budget version ROLLBACK (Versioning STATE/NAV B2)
-- Migration 219
-- ============================================
--
-- Make an older, non-draft version Current again. The chosen version vN becomes
-- the approved Current (locked baseline); every version NEWER than it — plus the
-- former Current (even if it's not the highest number, i.e. the roll-FORWARD
-- case) — becomes `rolled_back`, INCLUDING any in-progress draft head (that draft
-- work is discarded; the UI warns).
--
-- Status-only changes on budget_versions:
--   • the `deny_write_on_locked_version` trigger is on the SNAPSHOT tables
--     (sections/lines/income) — this RPC never touches them, so frozen snapshots
--     stay frozen;
--   • the `guard_version_status_change` trigger approver-gates any transition
--     into/out of 'approved' — covered by the approver gate below (same txn).
--
-- New status `rolled_back` is a DISTINCT historical state (not a flag on
-- 'superseded') so the selector can badge it and the timeline reads truthfully.
-- It behaves like 'superseded' for viewing: selectable, viewable, read-only.
--
-- Idempotent. Down-migration at the end.

-- 1. Widen the status CHECK to add 'rolled_back'. In migration 212 the check is an
--    inline column constraint → Postgres auto-named it `budget_versions_status_check`.
--    DROP IF EXISTS + re-ADD (same name) so a re-run is a no-op.
ALTER TABLE public.budget_versions
  DROP CONSTRAINT IF EXISTS budget_versions_status_check,
  ADD  CONSTRAINT budget_versions_status_check
       CHECK (status IN ('draft', 'approved', 'superseded', 'rolled_back'));

-- 2. The rollback RPC — mirrors approve_budget_version (212): SECURITY DEFINER,
--    approver-gated, demote FIRST / promote LAST so the
--    `budget_versions_one_approved_per_tour` partial unique index never sees two
--    approved rows mid-transaction.
CREATE OR REPLACE FUNCTION public.budget_version_rollback(p_version_id uuid)
RETURNS public.budget_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.budget_versions;
BEGIN
  SELECT * INTO v FROM public.budget_versions WHERE id = p_version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'budget version not found'; END IF;
  IF v.workspace_id IS DISTINCT FROM public.get_my_workspace_id() THEN
    RAISE EXCEPTION 'budget version not in your workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_budget_approver() THEN
    RAISE EXCEPTION 'not authorised to roll back budget versions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.status = 'draft' THEN
    RAISE EXCEPTION 'cannot roll back to the working draft';
  END IF;
  IF v.status = 'approved' THEN
    RAISE EXCEPTION 'this version is already Current';
  END IF;

  -- Demote FIRST: the former Current (status='approved', catches roll-FORWARD
  -- where the Current is a LOWER number than the target) + everything newer than
  -- the target (catches the draft head + later supers/rolled_back). → rolled_back.
  UPDATE public.budget_versions
     SET status = 'rolled_back', approved_by = NULL, approved_at = NULL, updated_at = now()
   WHERE tour_id = v.tour_id
     AND id <> v.id
     AND (status = 'approved' OR version_number > v.version_number);

  -- Promote target LAST → the new approved Current.
  UPDATE public.budget_versions
     SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   WHERE id = v.id
  RETURNING * INTO v;

  RETURN v;
END;
$$;

-- ============================================================
-- DOWN MIGRATION (manual — uncomment to roll back)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.budget_version_rollback(uuid);
-- -- revert the CHECK to the 3-value set (only safe once no row is 'rolled_back'):
-- ALTER TABLE public.budget_versions
--   DROP CONSTRAINT IF EXISTS budget_versions_status_check,
--   ADD  CONSTRAINT budget_versions_status_check
--        CHECK (status IN ('draft', 'approved', 'superseded'));
