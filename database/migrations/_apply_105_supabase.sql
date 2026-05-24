-- APPLY 105 in Supabase SQL Editor (Phase B §B0)
-- Adds budget_line_items.actual_cost_override BOOLEAN NOT NULL DEFAULT FALSE.
-- Replaces the §A3 actual-vs-sum inference with explicit flag storage.
-- Idempotent. Safe to re-run.
--
-- Markdown block comments removed; this paste-block uses only `--` line
-- comments so the Supabase SQL Editor's trailer-block quirk can't corrupt
-- the parse (see prior incident on _apply_104).

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS actual_cost_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.budget_line_items.actual_cost_override IS
  'TRUE when the user has explicitly set actual_cost to a value that should not auto-sync to the transactions sum. Set by deliberate edits in the ACTUAL field; cleared by the "Sync to transactions sum" button or by deleting all transactions.';
