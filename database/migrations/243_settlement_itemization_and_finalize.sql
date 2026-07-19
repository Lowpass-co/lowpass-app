-- ============================================================================
-- 243_settlement_itemization_and_finalize.sql
--
-- M1-B / M1-C — Money legibility + settlement.
--   • Itemized settlement lines: settlement_deductions (typed), settlement_expenses,
--     settlement_payments (typed), replacing/augmenting the single legacy
--     settlement.*_deductions value.
--   • settlement.deposit_received + settlement.full_and_final on the settlement grain.
--   • tours.payroll_finalized_at — the per-tour payroll finalize lock (M1-C).
--   • Guarded backfill: each settlement's legacy single deductions value becomes one
--     'other' settlement_deductions row ("Migrated deductions").
--
-- Grain: the settlement table is one row per routing_id (per show); the new line
-- tables FK to settlement(id) ON DELETE CASCADE.
--
-- HAND-APPLIED: paste into the Supabase SQL editor. Fully idempotent / re-runnable
-- — every statement guards itself, and the backfill is a no-op once itemized rows
-- exist for a settlement. Down-block at the end.
-- ============================================================================

BEGIN;

-- 1. Typed deductions (Guarantee → Adjusted gross). TEXT + CHECK matches the
--    codebase's constraint idiom (e.g. budget_income.actuals_source).
CREATE TABLE IF NOT EXISTS public.settlement_deductions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.settlement(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'other'
                  CHECK (kind IN ('withholding','tax','venue_cost','commission','other')),
  label         TEXT,
  amount        NUMERIC NOT NULL DEFAULT 0,
  currency      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlement_deductions_settlement_idx
  ON public.settlement_deductions(settlement_id);

-- 2. Itemized show expenses (Adjusted gross → Show net).
CREATE TABLE IF NOT EXISTS public.settlement_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.settlement(id) ON DELETE CASCADE,
  label         TEXT,
  amount        NUMERIC NOT NULL DEFAULT 0,
  currency      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlement_expenses_settlement_idx
  ON public.settlement_expenses(settlement_id);

-- 3. Payment log (outstanding = Balance due − Σ payments).
CREATE TABLE IF NOT EXISTS public.settlement_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.settlement(id) ON DELETE CASCADE,
  method        TEXT NOT NULL DEFAULT 'wire'
                  CHECK (method IN ('wire','check','cash','ach')),
  amount        NUMERIC NOT NULL DEFAULT 0,
  currency      TEXT,
  paid_on       DATE,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlement_payments_settlement_idx
  ON public.settlement_payments(settlement_id);

-- 4. Settlement grain: deposit received (Artist total → Balance due) + Full & Final.
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS deposit_received NUMERIC;
ALTER TABLE public.settlement ADD COLUMN IF NOT EXISTS full_and_final BOOLEAN NOT NULL DEFAULT false;

-- 5. Per-tour payroll finalize lock (M1-C). NULL = editable; a timestamp = finalized.
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS payroll_finalized_at TIMESTAMPTZ;

-- 6. RLS — workspace-scoped, mirrors budget_income's policy (017_budget_system.sql).
ALTER TABLE public.settlement_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlement_deductions_workspace" ON public.settlement_deductions;
CREATE POLICY "settlement_deductions_workspace" ON public.settlement_deductions FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE public.settlement_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlement_expenses_workspace" ON public.settlement_expenses;
CREATE POLICY "settlement_expenses_workspace" ON public.settlement_expenses FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

ALTER TABLE public.settlement_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlement_payments_workspace" ON public.settlement_payments;
CREATE POLICY "settlement_payments_workspace" ON public.settlement_payments FOR ALL
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

-- 7. Backfill: legacy single deductions → one 'other' row. Effective legacy value =
--    reconciled_deductions (if non-zero) else day_of_deductions. Guarded: only when a
--    non-zero value exists AND the settlement has NO itemized deductions yet, so a
--    re-run (or a settlement the user already itemized) is a no-op.
WITH eff AS (
  SELECT s.id            AS settlement_id,
         s.workspace_id  AS workspace_id,
         t.currency      AS currency,
         COALESCE(NULLIF(s.reconciled_deductions, 0), NULLIF(s.day_of_deductions, 0)) AS ded
  FROM public.settlement s
  JOIN public.routing r ON r.id = s.routing_id
  JOIN public.tours   t ON t.id = r.tour_id
)
INSERT INTO public.settlement_deductions (workspace_id, settlement_id, kind, label, amount, currency)
SELECT eff.workspace_id, eff.settlement_id, 'other', 'Migrated deductions', eff.ded, eff.currency
FROM eff
WHERE eff.ded IS NOT NULL
  AND eff.ded <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.settlement_deductions d WHERE d.settlement_id = eff.settlement_id
  );

COMMIT;

-- ============================================================================
-- DOWN (manual — paste to reverse):
-- BEGIN;
-- DROP TABLE IF EXISTS public.settlement_payments;
-- DROP TABLE IF EXISTS public.settlement_expenses;
-- DROP TABLE IF EXISTS public.settlement_deductions;
-- ALTER TABLE public.settlement DROP COLUMN IF EXISTS deposit_received;
-- ALTER TABLE public.settlement DROP COLUMN IF EXISTS full_and_final;
-- ALTER TABLE public.tours DROP COLUMN IF EXISTS payroll_finalized_at;
-- COMMIT;
-- ============================================================================
