# CC — Budget finalise wrap: Step 6 (flip default) + verify follow-ups

Steps 1–5 (BUD-41…45) **live-verified via Chrome** (Adam's preview, `34af135`):
currency binds to DISPLAY (cells source + red ≈, totals + burn bar all move
together), slide Transactions/Documents load on open, `/grid-demo` untouched.
Green-lit. This wraps Phase 3 budget.

## Step 6 / BUD-46 — flip the default to Grid
Make **Grid** the default view on Budget → Expenses (Classic stays available via
the toggle). Update the toggle's default + note in `budget.md`.

## Follow-ups from the verify (land in this pass)
- **BUD-47 — slide Actual live-updates on a transaction edit.** Today a txn
  add/edit/delete syncs `actual_cost` server-side but the slide's Actual + the
  grid cell only reflect it after a reload. After a txn POST/PATCH/DELETE, refetch
  (or optimistically update) the line's effective actual so the slide Actual + the
  grid cell update **without a full page reload**. (No per-keystroke refresh —
  update on commit.)
- **BUD-48 — loaded receipts show their number.** Freshly-attached receipts show
  their number, but receipts loaded with the line show a generic "Receipt" label.
  Join `expense_receipts` (receipt number) into the transactions GET so loaded
  receipts render their number too.

## Explicitly NOT in scope
- The txn **🔗 Link** stays a Phase-4 stub (no `transaction_links` write).
- No Income/settlement/projections (Phase 4).

## Hard rules
- Tokens; `next build --webpack`; tsc 0; eslint 0; don't regress BUD-41…45 or the
  demo path.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify BUD-46 (Grid is default), BUD-47 (slide Actual moves on a txn
  edit, no reload), BUD-48 (loaded receipt shows its number) on the preview.
- Land BUD-46/47/48 in `docs/smoke-tests/budget.md`.

After this is verified, Phase 3 budget is **done** → merge `feat/personnel-unify`
→ main, then start Rooming (`CC_ROOMING.md`).
