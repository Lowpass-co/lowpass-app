/* ============================================================
   MIGRATION 105 — actual_cost_override flag (Phase B §B0)

   Replaces the brittle "actual_cost differs from transactions
   sum" inference (Phase A §A3) with explicit per-row storage
   of whether the user has set a manual override. Auto-sync
   runs unless this flag is true.

   Background: §A3's inference broke the create-then-add flow.
   User types $1000 in Actual, then adds two transactions
   summing to $1300 — sum != actual, so §A3 treated it as an
   override and never synced. The user had no idea their $1000
   was being preserved when they expected the sum to win.

   With this flag, override is opt-in via deliberate user
   action only (see §B0 spec for the three edit paths that
   set/clear it). Default false — every existing row is
   treated as not-overridden.

   Idempotent. Safe to re-run.
   ============================================================ */

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS actual_cost_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.budget_line_items.actual_cost_override IS
  'TRUE when the user has explicitly set actual_cost to a value that should not auto-sync to the transactions sum. Set by deliberate edits in the ACTUAL field; cleared by the "Sync to transactions sum" button or by deleting all transactions.';

/* ============================================================
   DOWN MIGRATION (manual)
   ----------------------------------------------------------
   ALTER TABLE public.budget_line_items DROP COLUMN IF EXISTS actual_cost_override;
   -- actual_cost values preserved unchanged. The §A3 inference
   -- code path will resume operating against them; any rows
   -- where actual != sum will be treated as overrides until
   -- migration 105 is reapplied.
   ============================================================ */
