# CC — FX unification (P1). One exchange-rate truth. SINGLE OWNER.

Precondition: consolidation done, `main`, floor green. Adam has confirmed Decision 1 in `AUDIT_2026-07-03.md` (canonical FX source). Default assumption if unstated: per-tour rates from `budget_fx_rates`, `locked_fx_rate` wins for settled income rows, static table deleted.
Gates after every step: `tsc` 0 · `eslint` 0 · `next build --webpack` green.

## Problem (verified 2026-07-03)

Three FX mechanisms that never talk:

1. `src/lib/budget/fx.ts:1-21` — hardcoded static GBP-pivot table (`USD: 0.79`, `EUR: 0.85`, …), used by 10+ consumers **including `computeBudgetPnl.ts:163-164` for all expense conversion**, plus BudgetMainTable, BudgetSummaryTab, BudgetSpreadsheetView, BudgetBurnBar, GridView, PDF/XLSX export.
2. `src/lib/budget/fxRates.ts:13-30` — `budget_fx_rates` (admin-editable).
3. `src/app/api/budget/exchange-rate/route.ts:13-65` — live fetch persisted to `budget_settings.exchange_rate` (a third store).
4. Migration 225 `budget_income.locked_fx_rate` — write-once at settlement (income only).

Result: P&L mixes locked/live income rates with stale hardcoded expense rates. The bottom line is incoherent on any multi-currency tour.

## Work

1. **Before touching anything: snapshot.** Pick (or seed) one multi-currency test tour; record its P&L totals (projected + actual, per section and net). You will diff against this after — the numbers are EXPECTED to change (they were wrong); the report must show old vs new and why new is right.
2. Build `src/server/budget/getFxRate.ts`: `getFxRate({ tourId, from, to, lockedRate? })` → precedence: explicit `lockedRate` (settled income rows) → tour's `budget_fx_rates` entry → error/flagged-fallback (NOT a silent hardcoded default). Sync helper + preloaded-map variant for grid/export hot paths (they can't await per cell — check how `computeBudgetPnl` iterates before designing the signature).
3. Migrate every `convertToCurrency` consumer to it. Then delete `src/lib/budget/fx.ts`. Grep gate: `grep -rn "RATES_VS_GBP\|from '@/lib/budget/fx'" src/` → zero hits. Paste output.
4. Collapse store #3: `exchange-rate/route.ts` becomes "fetch live rate → upsert into `budget_fx_rates`" (an admin refresh action). Migration (next free number ≥ 234, idempotent, down-block, hand-paste SQL for Adam — NO runner) to migrate any real values out of `budget_settings.exchange_rate` and drop the column.
5. UI: wherever a converted figure renders, the rate used must be inspectable (tooltip or settings panel showing the tour's rates + last-updated). Missing rate for a currency pair → visible warning chip, not silent GBP-pivot math.

## Out of scope — flag, don't fix
Income actuals provenance (separate spec), settlement flow logic, adding new currencies UI.

## Verify before claiming (hard rule)
Report: old-vs-new P&L diff on the test tour with per-line explanation, grep-gate outputs, the migration SQL (for Adam to paste), files+lines changed, floor-green confirmation, smoke list (BUD-* money IDs in `docs/smoke-tests/budget.md` + one export re-run confirming PDF/XLSX totals match on-screen totals).
