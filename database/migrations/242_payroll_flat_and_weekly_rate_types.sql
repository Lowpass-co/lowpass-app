-- ============================================
-- LOWPASS — Payroll Flat-tour + Weekly rate types (G2-1 rate-type wiring)
-- Migration 242 — MONEY-CRITICAL (reconciliation-gated)
--
-- Completes the graded rate-type set (Day rate / Flat tour / Weekly / Per diem
-- only). Adds two global default rate types:
--   a7  Flat tour  fee · flat_once  — one lump sum for the engagement
--   a8  Weekly     fee · per_week   — amount × distinct Mon-anchored active weeks
--
-- Requires a new `basis` value 'per_week' (fees.ts already computes it; the
-- reconcile harness proves per_week/flat_once totals). No backfill: the legacy
-- personnel_rates columns have no flat/weekly source — amounts are entered in the
-- dynamic Rates grid (personnel_rate_lines), and writeRates never fabricates one.
--
-- Idempotent: guarded CHECK swap + fixed seed UUIDs + ON CONFLICT DO NOTHING.
-- Down-block at the end.
-- ============================================

-- ── 1. Widen the basis CHECK to allow 'per_week' ────────────────────
-- Drop the existing named-or-anonymous CHECK on rate_types.basis and re-add
-- with the extra value. The constraint name in 228 was auto-generated, so find
-- and drop whatever CHECK references `basis`, then add a stable named one.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.rate_types'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%basis%'
  LOOP
    EXECUTE format('ALTER TABLE public.rate_types DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.rate_types
  ADD CONSTRAINT rate_types_basis_check
  CHECK (basis IN ('per_day_status', 'per_active_day', 'flat_once', 'per_week'));

-- ── 2. Seed the two global defaults (fixed UUIDs → deterministic) ────
INSERT INTO public.rate_types (id, workspace_id, name, bucket, basis, day_statuses, order_index, is_default)
VALUES
  ('00000000-0000-0000-0000-0000000000a7', NULL, 'Flat tour', 'fee', 'flat_once', '{}', 6, true),
  ('00000000-0000-0000-0000-0000000000a8', NULL, 'Weekly',    'fee', 'per_week',  '{}', 7, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOWN (manual)
-- DELETE FROM public.rate_types WHERE id IN (
--   '00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a8');
-- ALTER TABLE public.rate_types DROP CONSTRAINT IF EXISTS rate_types_basis_check;
-- ALTER TABLE public.rate_types
--   ADD CONSTRAINT rate_types_basis_check
--   CHECK (basis IN ('per_day_status', 'per_active_day', 'flat_once'));
-- ============================================
