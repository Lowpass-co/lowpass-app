-- ============================================
-- LOWPASS — Widen budget_line_items.source_entity_type CHECK (Phase 3)
-- Migration 208
-- ============================================
--
-- Migration 026 created the CHECK allowing only
--   ('hotel_booking', 'flight_booking').
-- But the live code writes more values onto budget_line_items.source_entity_type:
--   • 'payroll' + 'payroll_per_diem'  — src/server/budget/reconcileDerivedLines.ts
--   • 'flight'                         — canonical flight link
--   • 'gear'                           — gear-hire reconcile (line-items GET)
-- The live DB's constraint has clearly drifted to permit these (the Salary,
-- Per Diem, Accommodation and gear derived sections all exist on the running
-- app), but no migration ever recorded the widening. On a FRESH clone the 026
-- constraint would reject those inserts — and because reconcile is wrapped in
-- try/catch, the derived sections would silently never appear.
--
-- This migration records + fixes the drift so a fresh clone reconciles. It is
-- read-safe for Phase 3 (the grid only READS derived lines); it only relaxes a
-- CHECK, never narrows it, so existing rows always validate. Idempotent.

ALTER TABLE public.budget_line_items
  DROP CONSTRAINT IF EXISTS budget_line_items_source_entity_type_check;

ALTER TABLE public.budget_line_items
  ADD CONSTRAINT budget_line_items_source_entity_type_check
  CHECK (
    source_entity_type IS NULL
    OR source_entity_type IN (
      'hotel_booking',
      'flight_booking',
      'flight',
      'payroll',
      'payroll_per_diem',
      'gear'
    )
  );

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert; only safe if no row uses a
-- value outside the 026 set)
-- ============================================
-- ALTER TABLE public.budget_line_items
--   DROP CONSTRAINT IF EXISTS budget_line_items_source_entity_type_check;
-- ALTER TABLE public.budget_line_items
--   ADD CONSTRAINT budget_line_items_source_entity_type_check
--   CHECK (source_entity_type IS NULL
--     OR source_entity_type IN ('hotel_booking', 'flight_booking'));
