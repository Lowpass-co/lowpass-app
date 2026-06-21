-- ============================================
-- LOWPASS — Dedupe + uniquify expense_receipts.receipt_number (BUD-01)
-- Migration 209
-- ============================================
--
-- BUG: the receipts POST (src/app/api/budget/receipts/route.ts) computed the
-- "next" R-00n by reading the current max per tour, but swallowed the SELECT
-- error and was non-atomic — so existing receipts were stored with DUPLICATE
-- numbers (Adam's are all "R-001"). expense_receipts.receipt_number has no
-- UNIQUE constraint (migration 017), so the duplicates persisted silently and
-- every chip rendered "R-001".
--
-- This migration is the DATA half of the fix (the code half stops new dups +
-- retries on conflict). It must run AFTER the renumber so the UNIQUE add can't
-- fail on pre-existing dups.
--
--   1. Renumber every tour's receipts contiguously R-001.. by created_at order
--      (then id, as a stable tiebreaker). receipt_number is display-only — no
--      FK or code references it by value (links are by receipt_id) — so this is
--      safe. NOTE: this also compacts any gaps from prior deletes; that's
--      intended (the goal is a clean, unique, contiguous per-tour sequence).
--   2. Add UNIQUE (tour_id, receipt_number) so a recurrence is rejected at the
--      DB (which is what makes the code's retry-on-23505 actually catch).
--
-- Idempotent: re-running the renumber is a no-op (IS DISTINCT FROM guard +
-- deterministic ordering); the constraint add is guarded by a catalog check.

-- 1. Renumber per tour (creation order).
WITH numbered AS (
  SELECT
    id,
    'R-' || LPAD(
      (ROW_NUMBER() OVER (PARTITION BY tour_id ORDER BY created_at ASC, id ASC))::text,
      3, '0'
    ) AS new_number
  FROM public.expense_receipts
)
UPDATE public.expense_receipts e
SET receipt_number = n.new_number,
    updated_at = now()
FROM numbered n
WHERE e.id = n.id
  AND e.receipt_number IS DISTINCT FROM n.new_number;

-- 2. Enforce per-tour uniqueness (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_receipts_tour_receipt_number_key'
  ) THEN
    ALTER TABLE public.expense_receipts
      ADD CONSTRAINT expense_receipts_tour_receipt_number_key
      UNIQUE (tour_id, receipt_number);
  END IF;
END $$;

-- ============================================
-- DOWN MIGRATION (manual — uncomment to invert; the renumber is not reversible)
-- ============================================
-- ALTER TABLE public.expense_receipts
--   DROP CONSTRAINT IF EXISTS expense_receipts_tour_receipt_number_key;
