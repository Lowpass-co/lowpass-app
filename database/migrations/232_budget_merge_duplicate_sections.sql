-- ============================================
-- LOWPASS — Merge duplicate Salary / Per-Diem budget sections (Phase S backfill)
-- Migration 232
-- ============================================
--
-- The payroll reconcile used to create a "Salary" / "Per Diem" (singular) section
-- for its derived lines, while the seeded templates name them "Salaries" / "Per
-- Diems" (plural) — so tours ended up with TWO sections. The code fix
-- (reconcileDerivedLines.ensureSection alias-matching) stops NEW duplicates; this
-- one-time backfill collapses the pairs that already exist:
--   for each tour with both, move the singular twin's lines into the plural
--   (template) section, then delete the now-empty twin.
--
-- Safe: lines are MOVED before the twin is deleted, and the delete is guarded to
-- only remove a section with no remaining line-items. Idempotent — re-running
-- finds no pairs. Down-block at the end (not auto-reversible — the split is lost).
--
-- Adam: apply after review (idempotent; touches budget_sections + line references
-- only, no money values change — lines keep their costs, just their section_id).
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
    -- Move the twin's derived (and any manual) lines into the template section.
    UPDATE public.budget_line_items
       SET section_id = pair.keep_id
     WHERE section_id = pair.twin_id;

    -- Repoint any versioning snapshot rows that referenced the twin section.
    UPDATE public.budget_version_lines
       SET section_id = pair.keep_id
     WHERE section_id = pair.twin_id;

    -- Delete the now-empty twin (guarded: only if nothing still points at it).
    DELETE FROM public.budget_sections s
     WHERE s.id = pair.twin_id
       AND NOT EXISTS (SELECT 1 FROM public.budget_line_items li WHERE li.section_id = s.id);
  END LOOP;
END $$;

-- Verify (expect 0 rows — no tour should still have both):
--   SELECT tour_id, count(*) FROM public.budget_sections
--   WHERE lower(name) IN ('salary','salaries') GROUP BY tour_id HAVING count(*) > 1;
--   SELECT tour_id, count(*) FROM public.budget_sections
--   WHERE lower(name) IN ('per diem','per diems') GROUP BY tour_id HAVING count(*) > 1;

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   -- Not auto-reversible: the twin sections + the original line/section
   -- assignments are gone. Restore from a backup if the split is needed.
   ============================================================ */
