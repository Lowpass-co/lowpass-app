# CC — Income ACTUALS enrichment (#24). Stage B: GO. Build. Branch off `main`.

`ACTUALS_ENRICHMENT_MAP.md` reviewed + signed off by Adam + Claude. **Commit the map** if not already on a
branch. Decisions LOCKED below (one is an Adam override of the map's D3). Build on a fresh branch off
`main` (`feat/income-actuals`).

## Decisions — LOCKED
- **D1 = model (b): settlement-authoritative.** Keep the actual MONEY (`actual_overage/merch/vip`)
  settlement-fed exactly as today. ADD real **tickets / gross / capacity** as **informational context +
  variance** — they **never enter `income_gross`** / `computeBudgetPnl` (the invariant at
  `computeBudgetPnl.ts:204-209` must not move for existing rows). The projection engine
  (`incomeProjection.ts`) is **not touched**.
- **D3 (Adam override of the map) = a REAL settled capacity, always.** Add **`actual_capacity`** as a real
  per-show field (hand-entered — it reflects the true sellable cap after kills/holds, which settlement
  doesn't carry). **Sell-through = `actual_tickets_sold / actual_capacity`** (NOT the projected cap).
- **D4 = editable in the grid.** `actual_tickets_sold`, `actual_gross`, `actual_capacity` are **editable**
  Actual cells (enter real numbers before a formal settlement). The settlement cascade still **overwrites
  tickets/gross** when run (like `actual_deductions`); `actual_capacity` is grid-entry only.
- **D2 = yes, the read-only "formula overage" reference.** Beside the settled `actual_overage`, show a
  **reporting-only** reference = the overage the **engine** would produce from **actual tickets/gross + the
  row's PROJECTED deal terms** (read-only call into `incomeProjection`; never written, never a second
  source). It answers "what should the overage have been at this real attendance?" without touching the
  settled money.
- **D5 = new Actual columns (Tickets · Gross · Cap · Sell%) + a variance strip** (projected vs actual:
  sell-through, gross, per-output). `computeBudgetPnl` untouched.
- **D6 = names `actual_tickets_sold` · `actual_gross` · `actual_capacity`.**

## Build
1. **Migration (re-confirm number).** Add `actual_tickets_sold`, `actual_gross`, `actual_capacity`
   (NUMERIC, nullable) to **`budget_income`**; add `actual_tickets_sold` + `actual_gross` to the
   **`settlement`** table (so settlement captures them and the cascade copies them — mirror
   `actual_deductions`). `actual_capacity` is **budget_income only** (grid-entry, not a settlement figure).
   **Actual-only → NOT on `budget_version_income`** (actuals are never versioned/locked). Idempotent,
   down-block. **Number: 220 is taken (override), Receipts B2 also wants 221 — this likely takes 221 or 222.
   Re-confirm across `main` + active branches at write time** (collisions have bitten three times).
2. **Settlement cascade** (`settlement/route.ts:239-265`). Extend the existing cascade so a settlement
   writes `actual_tickets_sold` + `actual_gross` into `budget_income` **preferring reconciled over day-of**,
   exactly like `actual_deductions`. Don't touch the money cascade.
3. **Income route** (`income/route.ts`, the actual-write path + the `onEdit` map). Accept + persist the
   three new actual fields. They are **informational** — they must NOT feed `income_gross`, the recompute,
   or the projection outputs. (They're actual-only; the projected-output computed-lock is unaffected.)
4. **Grid — Actual view** (`BudgetIncomeGrid.tsx`, the Actual column set `:349-357` + `onEdit` `:208-211`).
   Add editable **Tickets**, **Gross**, **Cap** columns and a **Sell%** calc column
   (`actual_tickets_sold / actual_capacity`, blank if cap missing). Add the read-only **formula-overage
   reference** (D2) beside the settled Overage. All new Actual columns are **editable and NEVER lock** — the
   Actual view already passes `[]` to `versionLockedCols`; keep that (do not add them to any lock set).
   Per-show currency (216) applies to Gross like the other money cells.
5. **Variance strip** (D5). Surface projected-vs-actual: **sell-through** (`est_sell_thru` vs
   `actual_tickets_sold/actual_capacity`), **gross** variance, and per-output variance. Render as Actual
   columns + a compact strip — **read-only, presentation only, `computeBudgetPnl` stays untouched**.
6. **Type plumbing** through `income.ts` + the actual-view mapping.

## Hard rules
- **Branch off `main`. Commit + PUSH. Confirm `git log origin/<branch>` before reporting.**
- **`income_gross` must not move for existing rows** — the new fields are informational; they never enter
  `computeBudgetPnl` (`:204-209` sums guarantee+overage+merch+vip−deductions only). Don't regress the
  projection fix (outputs computed-locked), the override (#28B), B1/B2 versioning, or per-show currency.
- **Actuals NEVER lock / never version.** New columns are actual-only, absent from `budget_version_income`
  and every `versionLockedCols`.
- **Settlement stays authoritative** for the money. The formula-overage reference is **read-only** and
  never writes. `incomeProjection.ts` math is unchanged (the reference is a read-only call).
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0. Smoke IDs `INC-ACT-01..` in `docs/smoke-tests/budget.md`.
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify: enter real tickets/gross/
  cap on an un-settled show → Sell% computes vs the real cap; the variance strip shows projected-vs-actual;
  the formula-overage reference renders beside the settled overage (read-only); running settlement
  overwrites tickets/gross; the Summary P&L Net is unchanged by any of it.
