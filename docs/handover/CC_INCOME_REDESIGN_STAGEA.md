# CC — Income Redesign, Stage A (MAP ONLY, no code). Gated.

The budget income model is getting reworked: **actuals from Settlement**, **projected
merch/VIP via formula**, **per-show currency**, and a **P&L/Summary refresh**. This is
design-heavy and touches the budget data model + the freshly-shipped versioning
(`budget_version_income`). **Stage A is a map only — no schema, no UI — until reviewed by
Adam + Claude.** Mirror the versioning Stage-A discipline.

## Context already established (don't re-derive, confirm)
- Income lives in `budget_income` (proposed `pre_tax_guarantee/withholding_pct/
  pre_tax_overage/merch_income/vip_income`; actual `actual_*`), surfaced in
  `BudgetIncomeGrid`, version-snapshotted in `budget_version_income` (migration 212).
- **A settlement tool already exists**: `src/app/(app)/budget/[tourId]/settlement/page.tsx`,
  `src/app/api/budget/settlement/route.ts`, `.../settlement/upload/route.ts`. The redesign
  **integrates** with it — does not replace it.
- **No venue-capacity source** in the budget model (canonical_venues.capacity exists but is
  NULL). **No per-show currency** on routing/income today.
- Versioning coupling: any income schema change must carry `budget_version_income` (the tax
  flagged when we chose to version income in Phase 1).

## ⛔ Stage A — MAP ONLY → `INCOME_REDESIGN_MAP.md`
1. **Current income model.** Map `budget_income` (every column, proposed vs actual),
   `BudgetIncomeGrid`, `computeBudgetPnl` (or wherever the P&L is computed), the Summary tab.
   What writes `actual_*` today?
2. **Settlement integration (D-SETTLEMENT — the crux).** Map what the settlement tool holds
   and produces today (`settlement` route + upload). **How should settlement feed
   `budget_income.actual_*`?** Per show → per income row. Is there a stable show/routing key
   to join on? Propose the write path (settlement → income actuals) + when it fires
   (on-settle, on-upload, manual reconcile).
3. **Projected formula (D-FORMULA).** Projected merch/VIP = `$/head × capacity × sellout%`.
   **Where do the inputs live?** Per-show vs per-tour default vs both. And **D-CAPACITY:
   where does capacity come from** — `canonical_venues.capacity` (currently NULL — who
   populates it?), a routing field, or a manual per-show entry? Flag this gap explicitly;
   it's the formula's hardest dependency.
4. **Per-show currency (D-CURRENCY / INC-05).** EU shows in EUR. Map adding a per-row
   currency to routing/income + **how the P&L converts to tour currency** — manual FX rate
   per show? a single tour-level rate table? live rates (out of scope likely)? The P&L must
   total in one currency; say how.
5. **P&L / Summary redesign (INC-04).** Map current `BudgetSummaryTab`. Is the redesign a
   canonical-grid treatment (like the other surfaces), a visual refresh, or both? Propose a
   direction; this is partly a design-taste call for Adam.
6. **Versioning impact.** Every proposed-income change must thread `budget_version_income`
   (snapshot) + the lock guard (proposed income read-only when approved, actuals live). Map
   what changes there.
7. **Blast radius + migration number.** List affected surfaces; next free migration (≥215 —
   214 is canonical-venues on main; verify across branches).

Surface D-SETTLEMENT / D-CAPACITY / D-FORMULA / D-CURRENCY / D-PNL with your recommendation
for each. **Then stop.** No schema, no UI.

## Hard rules
- Don't regress: the canonical `<Grid>`, the versioning lock/approve (proposed income must
  honor `versionLocked`), P&L parity, the settlement tool. Tokens; `next build --webpack`;
  tsc 0; eslint 0. RLS via existing helpers.
- **Branch off `main`** (not whatever's checked out — this bit B1/B2/canonical three times).
- **Verify before claiming.** Stage A is a doc; name real files/lines.
