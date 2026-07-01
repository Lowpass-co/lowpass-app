# CC — Budget Income → `<Grid>` Stage B: GO (D1–D6 answered)

`BUDGET_INCOME_MAP.md` reviewed; the bridge is correct — `computeBudgetPnl`
(+ `budget-utils`, `commission-context`, `DayViewTab`) read the DB `budget_income`
rows, not the tab, so a **UI-only** migration that keeps the `/api/budget/income`
endpoint + field names is transparent to `income_gross`. **Commit the map.** Build
Stage B.

## Decisions
- **D1 — Render shape: (a) plain `<Grid>`. YES.** Rows = shows, a read-only Show
  column, no add/delete. Matches Expenses; the rail variant (b) isn't wanted here.
  (Rows still populate from routing via the GET's `income` + `routing_only` merge —
  a new routing date appears as a row automatically; no manual add. That's exactly
  why D6's `allowAddRows=false` is right.)
- **D2 — Toggle: keep the segmented Projected/Actual control above the Grid,
  swapping the column set (re-key by view). YES.** Don't try to fold it into inline
  Proposed/Actual/Variance columns — income has too many money fields (guarantee/
  overage/merch/VIP) to show side-by-side cleanly. The toggle stays. (If Adam ever
  wants Expenses-style inline variance, that's a separate follow-up — not now.)
- **D3 — Column types. YES, they map cleanly.** Show = `text` (read-only), money
  fields = `money`, WH% = `number` (clamp 0–100), Post-tax + Total = `calc`
  (read-only derived). Post-tax = `pre_tax × (1 − wh/100)` stays the rule.
- **D4 — Persistence. YES.** `onEdit(routing_id, columnId, value)` → map → the
  existing `/api/budget/income` POST (single field, merge-safe upsert on
  `routing_id`, optimistic, no reload). Identical to today's `commit`, just sourced
  from the Grid. Endpoint + payload unchanged.
- **D5 — `BudgetCellInput`: shared with `BudgetSpreadsheetView` → leave it. YES.**
  Don't delete or alter it.
- **D6 — Add `allowAddRows?: boolean` to `<Grid>`, default `true`; Income passes
  `false`. YES — with the wide-mode invariant.** This is the SECOND additive `<Grid>`
  prop (wide mode is the other) and the same rule applies: **default preserves
  current behaviour** so Expenses, the demo, and every existing `<Grid>` consumer are
  byte-for-byte unchanged. Only Income opts out of the add-line row. Name the
  Expenses/demo files you confirm unchanged.

## Hard rules
- **The P&L feed must not move.** Field names (`pre_tax_guarantee, withholding_pct,
  pre_tax_overage, merch_income, vip_income` + `actual_*`), the post-tax rule, and
  the `/api/budget/income` upsert stay identical. After build, `computeBudgetPnl`
  must produce the same `income_gross` for the same inputs.
- Tokens; `next build --webpack`; tsc 0; eslint 0. Don't regress Expenses, the demo,
  or any other `<Grid>` consumer (the `allowAddRows` default guards this — prove it).
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify: edit guarantee / WH% / overage / merch / VIP → post-tax + total
  recompute, persist with no reload, the Projected↔Actual toggle swaps column sets,
  AND the Summary P&L income matches the old value for the same inputs.
- Land income smoke IDs + add Adam's manual smokes to `SMOKE_QUEUE.md`.
