# Phase 3 mount — live verification results (`806e508`, Chrome DOM)

Verified on the running preview, budget tour "Simple Plan Support | Fall'26"
(`6889d072…`), Budget → Expenses → **Grid (beta)**. Driven, not code-read.

## ✅ Passed (verified live)
- **BUD-39 fixed** — all **10 rows** render (4 Accommodation + 5 Salary + 1
  Uncategorised); the Filter lists the 5 DB statuses; `statusUniverse()` works.
- **Persistence survives reload** — set Freight est to £123, full reload, value
  held (£123) + burn bar moved £11,550→£11,673. (Reverted to 0 after.)
- **Derived locks enforced** — typed `999` into Jonny's (Payroll) est; it stayed
  £5,250. Salary + Accommodation rows show 🔒 on **both** est and act;
  Uncategorised (Freight) is unlocked. Matches decision 2.
- **DB status pills** render (`draft`); decision 1 honoured.
- **Derived classification + source pills** correct (🔗 ROOMING on Accommodation,
  🔗 PAYROLL on Salary).
- **Per-cell currency** correct — GBP lines render `£` natively (display = GBP),
  no false red.

## ❌ BUG — totals/KPIs render in the WRONG currency (USD, not the display currency)
The **cells** show `£` (GBP), the page **DISPLAY** selector is `£ GBP`, and the
**burn bar** shows `£11,673` — but the grid's **totals show USD**:
- toolbar: `10 rows · est $14,669 · act $14,669`
- SALARY section header: `est $14,669 · act $14,669`
- UNCATEGORISED header: `est $156` (for a £123 line)

`$14,669 = £11,550 × 1.27`, and **1.27 is `gridModel.FX`'s GBP→USD rate (the
demo USD-pivot table)**. So the **totals path still uses `gridModel.FX` + USD as
the display currency**, while the cell-rendering path was correctly switched to
the injected budget FX + the display currency. Decision 5 ("grid takes FX +
display currency as props") was applied to the cells but **missed the
total/KPI/section-header computation**.

**Fix:** the toolbar totals, section-header `est/act`, and group totals must use
the **same display currency + FX source as the cells** (the DISPLAY-selected
currency — GBP here — via `src/lib/budget/fx.ts`), not `gridModel.FX`/USD. After
the fix, with DISPLAY = £, every total reads `£…` and the SALARY total is
`£11,550`, matching the burn bar. (Switching DISPLAY to $ should then convert
*everything* — cells and totals — consistently.)

**Verify (render-time):** I'll re-confirm live — toolbar/section totals in `£`
matching the burn bar, and a DISPLAY-currency switch converting cells + totals
together.

## Not re-checked on real data (verified earlier on /grid-demo)
The LINE slide-over (same component); fine to confirm in passing once currency
lands.

## Net
The mount is sound — render, persistence, derived locks, statuses, FX-on-cells
all work. The single fix before flipping the default to Grid is the
totals-currency consistency above.
