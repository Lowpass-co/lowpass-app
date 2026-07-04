# CC — Rates convergence (P1). Kill the day-rate bug class for real. SINGLE OWNER.

Precondition: consolidation done (`CONSOLIDATION_2026-07-03.md`), you are on `main`, floor green.
Gates after EVERY step: `tsc --noEmit` 0 · `eslint` 0 · `next build --webpack` green. No Turbopack.

## Problem (verified 2026-07-03, file:line evidence)

The rate_lines SSOT cutover (migrations 228-230) landed, but three writers still bypass it:

1. `src/app/api/budget/personnel-rates/route.ts` — ZERO `rate_lines` references; writes legacy `personnel_rates.{show_rate,off_rate,rehearsal_rate,per_diem,advance_fee}` at 209-255, 333-337; keys the table by **row id**.
2. `src/app/api/tours/[id]/personnel/[memberId]/rates/route.ts:102-196` — legacy-only writer; keys the SAME table by **(tour_id, roster_personnel_id)**. Two keying schemes on one table = stale-ID clobber risk.
3. `src/app/api/tours/[id]/personnel/[memberId]/route.ts:101-102` (+ `api/tour-personnel/[id]/route.ts`) — accepts legacy `tour_personnel.rate_amount` in PATCH.

Reader that blocks 231: `src/app/api/budget/payroll/route.ts` hard-selects legacy columns, no rate_lines fallback. Additional legacy readers: `my-schedule/route.ts:44,47`, `(app)/tours/[id]/overview/page.tsx:72`, `(app)/operations/[tourId]/payroll/page.tsx:101`.

## Work

1. **One write module.** Create `src/server/payroll/writeRates.ts` (or extend the existing SSOT module if `feat/rates-ssot-part-a`'s cutover created one — CHECK FIRST, don't duplicate): single function that writes `personnel_rate_lines` AND mirrors the legacy columns (until 231 applies), in one transaction-shaped RPC or sequenced writes with error rollback. Single keying scheme: `(tour_id, roster_personnel_id)`.
2. **Convert all three writers** above to call it. The budget route's row-id keying gets translated to the canonical key internally; reject requests whose row id doesn't resolve.
3. **Convert readers — centralize the fallback in ONE place.** The legacy fallback lives only in the SSOT read lib (`loadRateLines.ts` / `fees.ts` bridge). Every call site reads through it and never names legacy columns itself. `api/budget/payroll` + the other legacy readers + every component naming legacy columns (~30 files — see SCOPE below) convert to the lib. Fallback logs when it fires, so we can watch it go quiet.
4. **Grep gate (AMENDED 2026-07-04 — ruling on CC's Stage-1 pre-read; supersedes the original, which conflicted with step 3):** `grep -rn "show_rate\|off_rate\|rehearsal_rate\|rate_amount" src/ --include="*.ts" --include="*.tsx"` returns hits ONLY inside: `writeRates.ts` (mirror code), the SSOT rate lib (`fees.ts`, `rateLines.ts`, `loadRateLines.ts`), type definitions, tests (`fees.test.ts`), and migration files. Rationale: legacy-column knowledge is permitted in exactly one writer module and one reader module; everywhere else it dies. Paste the grep output in your report.

## SCOPE (measured by CC 2026-07-04, not estimated)
208 legacy-column refs across 35 files; excluding type defs, tests, and the SSOT lib, ~30 genuine call-site files convert — including `budget/personnel-rates` (~340 lines), `[memberId]/rates`, `[memberId]`, `tour-personnel/[id]`, `persons/[id]`, `budget/{payroll,summary,ai/template}`, the overview page, and components `SummaryView`, `TourBudgetAccordion`, `PersonnelRatesSection`, `PersonnelManageSlideOver`, `CrewMyScheduleClient`, `usePayrollGrid`, `PayrollDaysMatrix`, `overview-utils`, `TourPersonnelClient`, `_legacy/SalariesTab`, `budget-utils`, `commission-context`. This is one full, careful session. Order: `writeRates.ts` module → the 3 writers → centralize fallback in the read lib → API readers → components → harness + grep + floor. If any call site cannot convert without a behavior change, STOP on that file and flag it in the report — do not force it.
5. Re-run the reconciliation harness (RATE-01..05 smoke IDs in `docs/smoke-tests/operations.md`): the 5 defaults must reproduce `fees.test.ts` numbers exactly (Richie 4610.63, split 1606.62, flat 2250, rehearsal 500, per-diem 90). If money moves, STOP and report.
6. Update `231_payroll_drop_legacy_rate_columns.sql.HOLD`'s header checklist with the new reader/writer state. Do NOT apply or un-HOLD it — that's Adam's call after a soak period.

## Out of scope — flag, don't fix
Income actuals provenance, FX, per-diem derivation (`reconcileDerivedLines.ts` is correct — don't touch), UI redesign of rate editors.

## Verify before claiming (hard rule)
For every file you claim changed: name file + line range in the report. Open the diff yourself before reporting done. Report: files changed, grep-gate output, harness output, floor-green confirmation, and one smoke list for Adam (RATE-01..05 + edit a rate in each of the three old surfaces and confirm they all read back identically).
