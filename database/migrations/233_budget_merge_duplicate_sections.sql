-- ============================================
-- LOWPASS — Merge duplicate Salary / Per-Diem budget sections (Phase S backfill)
-- Migration 233  (reworks the failed 232 — respects the budget-versioning lock)
-- ============================================
--
-- The payroll reconcile used to create a "Salary" / "Per Diem" (singular) section
-- for its derived lines, while the seeded templates name them "Salaries" / "Per
-- Diems" (plural) — so tours ended up with TWO sections. The code fix
-- (reconcileDerivedLines.ensureSection alias-matching) stops NEW duplicates; this
-- one-time backfill collapses the pairs that already exist.
--
-- WHY 233 (the previous attempt failed): the first cut rewrote the snapshot table
-- budget_version_lines, and also tried to hard-delete a twin section that a locked
-- version pins. Both trip deny_write_on_locked_version() (212:141-157) —
-- "budget version <id> is locked (status=superseded); its proposed snapshot is
-- immutable" (ERROR 23514). Frozen snapshots MUST stay frozen (migration 219's
-- invariant). So this rework:
--   • operates on LIVE tables only (budget_line_items) — never the snapshot
--     tables (budget_version_lines / budget_version_sections);
--   • deletes a twin ONLY when it is not pinned by a NON-draft version. A twin
--     pinned by a locked version is left in place (empty) — that is acceptable
--     and by design (see "Residual" below).
--
-- Idempotent — re-running finds no unpinned pairs. Down-block at the end.
--
-- Adam: apply after review. No money values change (line items keep their costs,
-- only their section_id). Then confirm the residual list (below) matches tours
-- that have a locked (approved/superseded) version referencing the twin.
-- ============================================

DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT keep.id AS keep_id, twin.id AS twin_id
    FROM public.budget_sections keep
    JOIN public.budget_sections twin
      ON twin.tour_id = keep.tour_id
     AND twin.workspace_id = keep.workspace_id
     AND twin.id <> keep.id
    WHERE (lower(keep.name) = 'salaries'  AND lower(twin.name) = 'salary')
       OR (lower(keep.name) = 'per diems' AND lower(twin.name) = 'per diem')
  LOOP
    -- 1. Re-point the LIVE line items onto the template (keep) section. Live
    --    table, no lock trigger — always safe.
    UPDATE public.budget_line_items
       SET section_id = pair.keep_id
     WHERE section_id = pair.twin_id;

    -- NOTE: we intentionally do NOT touch budget_version_lines /
    --       budget_version_sections — those are immutable snapshots.

    -- 2. Delete the now-empty twin ONLY when no live line item still points at it
    --    AND no NON-draft version pins it (deleting would cascade / set-null onto
    --    a locked snapshot and trip the lock trigger). Draft-version references
    --    are fine — the cascade/set-null onto draft snapshots is permitted.
    DELETE FROM public.budget_sections s
     WHERE s.id = pair.twin_id
       AND NOT EXISTS (
         SELECT 1 FROM public.budget_line_items li WHERE li.section_id = s.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.budget_version_sections vs
         JOIN public.budget_versions v ON v.id = vs.version_id
         WHERE vs.section_id = s.id AND v.status <> 'draft')
       AND NOT EXISTS (
         SELECT 1 FROM public.budget_version_lines vl
         JOIN public.budget_versions v ON v.id = vl.version_id
         WHERE vl.section_id = s.id AND v.status <> 'draft');
  END LOOP;
END $$;

-- Verify — remaining duplicate pairs (expected: ONLY the pinned residuals, i.e.
-- tours whose twin section is referenced by an approved/superseded version).
-- Adam: this list should match the locked-version tours.
--   SELECT s.tour_id, count(*) AS dup_sections
--   FROM public.budget_sections s
--   WHERE lower(s.name) IN ('salary','salaries')
--   GROUP BY s.tour_id HAVING count(*) > 1;
--   SELECT s.tour_id, count(*) AS dup_sections
--   FROM public.budget_sections s
--   WHERE lower(s.name) IN ('per diem','per diems')
--   GROUP BY s.tour_id HAVING count(*) > 1;
-- Confirm each residual is genuinely pinned by a locked version:
--   SELECT s.id, s.tour_id, s.name, v.status
--   FROM public.budget_sections s
--   JOIN public.budget_version_sections vs ON vs.section_id = s.id
--   JOIN public.budget_versions v ON v.id = vs.version_id
--   WHERE lower(s.name) IN ('salary','per diem') AND v.status <> 'draft';

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   -- Not auto-reversible: the (unpinned) twin sections + their line/section
   -- assignments are gone. Restore from a backup if the split is needed. The
   -- snapshot tables were never touched, so locked versions are unaffected.
   ============================================================ */
