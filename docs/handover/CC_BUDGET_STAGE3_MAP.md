# CC_BUDGET_STAGE3_MAP — Budget Grid classic-parity + retire (P4 Stage 3)

> Scope map for bringing the canonical Budget Grid to Classic parity, then
> retiring Classic. **Money-adjacent** — display/threading only in Stage 3;
> never touch calculation (`fees.test`, `actualsProvenance`, `computeBudgetPnl`,
> `fxRates`). Line refs are against origin/main `1c176a1`.

## Money gates (re-run after every change; must not move)
- `node --experimental-strip-types src/lib/payroll/fees.test.ts` → **15 checks passed** (the docs' "52" is a stale figure; **15 is correct**), exact numbers intact.
- `node --experimental-strip-types src/lib/budget/actualsProvenance.harness.ts` → **18 checks passed, 0 failed**.
- FX grep gate: `grep -rn "RATES_VS_GBP\|from '@/lib/budget/fx'" src/` → **0 hits**.

## The two views
- **Classic** = `src/components/budget/BudgetSpreadsheetView.tsx` — the feature-rich safety-net default. Receives (from `budget/[tourId]/page.tsx`): `lines, sections, trackPhases, phases, routingDateById, duplicateMap (= duplicatesToRecord(detectDuplicates(lines))), tourCurrency, tourId, fxRates, income, commissions, settings, receiptSlot`.
- **Grid** = `src/components/budget/BudgetGridView.tsx` — the canonical `<Grid>` (`src/components/grid/Grid.tsx`) on real budget data via `budgetToGridSections` (`src/lib/grid/budgetAdapter.ts`). Currently receives a NARROWER prop set (no routing dates, no duplicate map, no phases). Its column set `EXPENSE_COLS` is `idx · item · est · act · var · status · rcpts · notes(hidden)` — explicitly **no vendor, no day-type** (self-documented decisions, `BudgetGridView.tsx` lines 12–13, 66).
- Both mounted via `BudgetGridToggle` in `src/app/(app)/budget/[tourId]/page.tsx` (~line 436). **`BudgetGridToggle` has exactly one importer** (that page) → clean to delete in step 2.

## The 4 parity gaps + their data sources (all EXISTING data — display/threading only)
| Gap | Data source (already computed on the page / adapter) |
|---|---|
| **Vendor column** | line-item vendor (from `budget_line_items` / transactions); the grid's `lineApi.listTransactions` already returns `vendor_name`. For the row-level vendor column, thread the line's vendor field through `budgetToGridSections`. |
| **Day-type pill + tick** | `routingDateById` (page already builds it; passed to Classic) → map a line's routing/day date → day-type. |
| **Duplicate-detection banner** | `duplicateMap = duplicatesToRecord(detectDuplicates(lines))` (page already computes it for Classic). Banner = count of duplicate groups + which lines. |
| **Phase grouping** | `trackPhases` (bool) + `phases[]` (page already passes to Classic). Group/label sections by phase when tracking is on. |

## Version bar — ALREADY COMPLIANT (do NOT touch)
`src/components/budget/versioning/versionApi.ts` are thin fetch wrappers to the four routes: `approve` → `/api/budget/versions/[id]/approve`, `unlock` → `/unlock`, `amend` → `/amend`, `rollback` → `/rollback` (migrations 212/219/220). No client-side version logic. `VersionLockModal` is wired into `BudgetGridView` (opens on a 423 VERSION_LOCKED). Leave as-is.

## Variance / derived / computed (Stage 3 step 3 display polish)
- Variance favourability colour already exists in `GridSlideOver` (`v.d > 0 → error/red`, else `success/green`); mirror on the grid **cell** (`Grid.tsx:1624`).
- Derived rows (Payroll/Rooming/…) already lock est+act in the adapter — add the "↗ from source" chip + tooltip.
- Computed/formula sections live on the Summary tab (excluded from the expenses grid) — ƒ chip + formula text there.

## Three-step sequence
1. **STEP 1 (this):** thread `routingDateById` / `duplicateMap` / `phases` / `trackPhases` (+ vendor) into `BudgetGridView`; add vendor column, day-type pill+tick, duplicate banner, phase grouping. **Display/threading only.** Money gates re-run green. Bank.
2. **STEP 2:** line-by-line parity audit of `BudgetSpreadsheetView`; **port anything beyond the four features first** (income/commissions/settings/receiptSlot are the known extras); then delete Classic + `BudgetGridToggle` (prove zero importers). Bank.
3. **STEP 3:** derived-row chip + tooltip, computed-section ƒ chip, variance cell colour, "+ Add line" toolbar + ghost row, keyboard footer wording, receipt drag-drop confirm. Bank.
