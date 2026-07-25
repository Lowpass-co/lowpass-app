-- ============================================
-- 251_receipt_proposals_extend_import_pending_lines.sql
--
-- RC-1 — receipts land as PROPOSALS in the EXISTING review grammar.
--
-- Adam's rule for this stage: ONE review-queue grammar and ONE fuzzy matcher in
-- the codebase. X1-B's `import_pending_lines` (migration 244) is the only
-- PERSISTED proposal store with an accept/reject route pair already built, so
-- receipts extend it rather than introducing a third table.
--
-- What this adds:
--   1. Two new `target` values so an accepted receipt proposal routes to the
--      right write path:
--        receipt_txn   → POST /api/budget/line-items/{id}/transactions
--                        (link to an EXISTING line; the amount lands as a
--                         transaction and reconciles into actual_cost)
--        receipt_line  → POST /api/budget/line-items  THEN the transaction
--                        (no match — create the line, then write the txn)
--      NOTE both go through the transaction path. THE INVARIANT
--      (useReceiptScan.ts:21) is that an amount only ever lands as a
--      transaction — never a direct actual_cost write. Nothing here creates a
--      path around that; `syncActualCostIfNoOverride` in the transactions route
--      stays the only writer of actual_cost.
--   2. `receipt_id` — nullable FK to expense_receipts, so a proposal knows which
--      stored receipt produced it (and a rejected proposal still leaves the
--      receipt stored, per RC-3).
--
-- REUSED AS-IS, no new columns needed:
--   dup_of / dup_reason → the duplicate-transaction guard (RC-2). dup_of is a
--     bare UUID (no FK in 244), so pointing it at a transaction id is legal.
--   source_ref          → the receipt number (R-00n), the human-readable origin,
--                         exactly as the workbook path uses "Budget!A14".
--   value JSONB         → the proposed payload in the target route's POST shape.
--   status              → pending / accepted / rejected / skipped, unchanged.
--
-- IDEMPOTENCY NOTE (this is the part that bites): a CHECK constraint cannot be
-- widened with ADD COLUMN IF NOT EXISTS or ALTER ... IF NOT EXISTS. It must be
-- DROPPED and RECREATED. Both statements below are guarded so a double-paste is
-- a no-op: DROP CONSTRAINT IF EXISTS, then ADD. The constraint is named
-- explicitly (244 created it inline, so Postgres auto-named it
-- import_pending_lines_target_check) — we drop that auto-name AND our explicit
-- name, so this is safe whether or not it has already run.
-- ============================================

-- 1. receipt_id → expense_receipts (nullable; workbook proposals leave it NULL).
ALTER TABLE public.import_pending_lines
  ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES public.expense_receipts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS import_pending_lines_receipt_idx
  ON public.import_pending_lines(receipt_id);

-- 2. Widen the target CHECK. Drop-and-recreate — see the idempotency note above.
ALTER TABLE public.import_pending_lines
  DROP CONSTRAINT IF EXISTS import_pending_lines_target_check;
ALTER TABLE public.import_pending_lines
  DROP CONSTRAINT IF EXISTS import_pending_lines_target_allowed;

ALTER TABLE public.import_pending_lines
  ADD CONSTRAINT import_pending_lines_target_allowed
  CHECK (target IN ('budget_line', 'income_actual', 'receipt_txn', 'receipt_line'));

-- 3. A receipt-sourced proposal must carry its receipt; a workbook one must not.
--    Guarded the same way (drop-then-add) so re-paste is a no-op.
ALTER TABLE public.import_pending_lines
  DROP CONSTRAINT IF EXISTS import_pending_lines_receipt_target_consistent;

ALTER TABLE public.import_pending_lines
  ADD CONSTRAINT import_pending_lines_receipt_target_consistent
  CHECK (
    (target IN ('receipt_txn', 'receipt_line') AND receipt_id IS NOT NULL)
    OR (target IN ('budget_line', 'income_actual') AND receipt_id IS NULL)
  );

-- RLS: import_pending_lines already has workspace-scoped policies from 244 and
-- they are target-agnostic, so receipt proposals inherit them. Nothing to add.

-- ============================================
-- DOWN
-- ============================================
-- ALTER TABLE public.import_pending_lines
--   DROP CONSTRAINT IF EXISTS import_pending_lines_receipt_target_consistent;
-- ALTER TABLE public.import_pending_lines
--   DROP CONSTRAINT IF EXISTS import_pending_lines_target_allowed;
-- ALTER TABLE public.import_pending_lines
--   ADD CONSTRAINT import_pending_lines_target_check
--   CHECK (target IN ('budget_line','income_actual'));
-- DROP INDEX IF EXISTS import_pending_lines_receipt_idx;
-- ALTER TABLE public.import_pending_lines DROP COLUMN IF EXISTS receipt_id;
