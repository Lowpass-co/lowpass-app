# CC — Income Phase 4: P&L / Summary visual refresh. Build. Branch off `main`.

The last income phase. Phases 1–3 (settlement→actuals + deductions, per-show currency + FX,
the deal-aware projection engine) are **on main**. Phase 4 makes the Summary **read like the
reference budget's bottom block** — surfacing the income breakdown the projection engine now
produces. **Presentation only: no money math changes, no schema.** The P&L is a **read-only
report — do NOT port it to `<Grid>`** (the map's D-PNL decision); refresh the existing
`BudgetSummaryTab` in place.

## Decisions — LOCKED
- **Visual refresh of `BudgetSummaryTab`**, not a Grid port. Keep `computeBudgetPnl` as the
  single source of truth.
- **Surface the income projection breakdown** — the headline new value: **Guarantee /
  Overage / Merch / VIP**, each **Projected vs Actual (+ Δ)**, the way the reference sheet's
  income block reads (gap-analysis §1 / the `ROUTING & INCOME` PROJECTED/ACTUAL rows). Today
  the Summary only shows gross income as one number; Phase 3 now computes the components, so
  break them out.
- **Versioning-aware variance** — where a version is approved, variance reads **Proposed
  (working) vs Approved (baseline) vs Actual**. Reuse the version the page already resolves
  (`page.tsx` active/approved version); don't add a new data path.

## Scope
1. **`BudgetSummaryTab.tsx`** — replace the bespoke dense `<table>` + chart layout with a
   token-clean, scannable report:
   - **Headline cards**: Gross Income · Total Expenses · **Net (P&L)** — each Projected vs
     Actual, Δ coloured (token green/orange, no hardcoded hex).
   - **Income breakdown** block: Guarantee / Overage / Merch / VIP rows, Projected · Actual ·
     Δ. (This is the bit that mirrors the reference and shows off the engine.)
   - **Expenses** block: by section, Projected · Actual · Δ; then the **overheads**
     (Accountancy/Insurance/Contingency %) and **commissions** lines that already feed
     `computeBudgetPnl`.
   - Keep the existing **chart** (re-styled to tokens if needed).
2. **`computeBudgetPnl.ts`** — **only if** it doesn't already expose the income components
   separately, add them to the **output** (a read-only breakdown: projected/actual guarantee,
   overage, merch, vip). **Do not change any math** — gross/net must stay identical; you're
   exposing existing intermediate values, not recomputing.
3. **No new inputs, no migration, no schema.** Pure read/presentation.

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH. Before reporting, run
  `git log origin/<branch>` and confirm the commit is on the remote branch.**
- Don't change `computeBudgetPnl`'s numbers — net/gross/expenses must equal the current
  values to the cent (the income/expense math is settled across P1–P3). Tokens only (no
  hardcoded hex/px); `next build --webpack`; tsc 0; eslint 0.
- Don't regress P1–P3, the versioning lock/approve, the currency conversion. The Summary is
  read-only — no edit affordances.
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify on a preview:
  the income breakdown shows Guarantee/Overage/Merch/VIP projected-vs-actual for a tour with
  Phase-3 projections; Net = Gross − Expenses − overheads − commissions and still equals
  `computeBudgetPnl`'s number; variance reads vs the approved version. **Adam eyeballs the
  look** — note it's a design-taste pass he may want to refine after seeing it. INC-PNL smoke
  IDs in `budget.md`.
