# CC — Payroll rate types, UI phase (makes b2 usable). Money-adjacent. Off `main`. Branch `feat/payroll-rate-types-ui`.

Prereq: the rate-types core is merged (migration 228 = `rate_types` + `personnel_rate_lines`, the
`computeTotals(lines, counts)` engine in `fees.ts`, backfill done, reconciliation proven). This phase adds the
dynamic-column grid + "Add rate type" + switches the readers to source amounts from `personnel_rate_lines`.

## ✅ RESOLVED — the day_rate fork (Adam: keep as flat-daily). DO THIS FIRST, before the reader-switch.
CC found (correctly) that `generate`'s `computeWeekFeeAndPerDiem` bills `day_rate` people **flat**
(`active × off_rate`, ignoring `show_rate`), while migration 228's backfill wrongly seeded them with the
**split** Show/Off lines — so a rate-lines switch would move their money. Adam's call: **keep day_rate as a
real flat-daily rate type; no persisted money moves.** Fix it before switching any reader:
1. **Migration 229** (confirm 229 is free): add a 6th default rate type **"Day rate"** (id `…a6`, `bucket='fee'`,
   `basis='per_active_day'`, `is_default`). **Corrective backfill:** for every `personnel_rates` row where
   `rate_type='day_rate'`, delete its Show(`a1`)/Off(`a2`)/Rehearsal(`a3`) fee lines and insert one `a6`
   Day-rate line `= off_rate`; keep its per-diem(`a4`) + advance(`a5`). `split_rate` rows: unchanged.
   Idempotent + down-block.
2. `computeTotals` already sums a `fee`-bucket `per_active_day` line as `amount × active_days` → a day_rate
   person now computes `off_rate × active` = the legacy flat total, EXACTLY. Confirm this in code.
3. **Extend the gate (below) with a day_rate case:** a `day_rate` person with `show_rate ≠ off_rate` over
   several show+off days — rate-lines total (via the `a6` flat line) MUST === the legacy `generate` flat total
   (`active × off_rate`). This is the case the 5-defaults gate was missing; it must pass.
Result: after 229, splits reconcile via `a1/a2/a3` and day_rate reconciles via `a6` — the reader-switch is
money-safe for everyone, AND `generate` finally matches the grid (the latent bug is fixed).

> ## 🔒 RECONCILIATION GATE (mandatory — the money safety)
> Switching the read source from the legacy `personnel_rates.*` columns to `personnel_rate_lines` must NOT move
> money. Before reporting done, extend `reconcile.harness.ts` to prove, for a real tour, that
> **rate-lines-sourced totals === legacy-column-sourced totals** for the 5 default types (and the existing
> `fees.test.ts` numbers still hold). Paste the harness output. If it doesn't reconcile, STOP.

## Build

### 1. Rate-type management API (workspace-scoped catalog)
- New endpoints (or extend `/api/budget/personnel-rates`): **create / rename / reorder / delete** a
  `rate_types` row (name, `bucket` fee|per_diem, `basis` per_day_status|per_active_day|flat_once,
  `day_statuses[]`). RLS `get_my_workspace_id()`. Deleting a type: block or cascade its `personnel_rate_lines`
  (choose safe — soft-block if any non-zero amounts, or confirm-cascade; don't silently drop money data).
- **Amount writes** → `personnel_rate_lines` (per tour+person+type). Creating a new type seeds a `0` line for
  everyone on the tour.

### 2. Dynamic-column Rates grid (`PayrollRatesSpreadsheet`)
- Columns generated from the workspace's `rate_types` (ordered `order_index`, grouped by bucket) — NOT the four
  hardcoded columns. Each editable cell writes the person's `personnel_rate_lines.amount` for that type.
- Keep the two-grid layout (from #18): editable Rates grid + read-only Summary totals below, totals from
  `computeTotals` over the rate-lines. Day counts unchanged (Days matrix stays).
- `internal_rate` stays its own admin-only path — NOT a public rate type.

### 3. "Add rate type" affordance
- Inline/modal: `name` + `bucket` (fee / per-diem) + `basis`; for `per_day_status`, pick which day statuses it
  bills (`show` / `off_travel` / `rehearsal`). Save → new column for everyone (amounts default 0).
- Rename / reorder / delete existing types from the grid header.

### 4. Switch the readers to `personnel_rate_lines` (each must reconcile — no number change for the 5 defaults)
Route every reader through the rate-lines model:
- `PayrollRatesSpreadsheet` + the Summary grid (§2).
- `/api/budget/payroll/generate` (fee/per-diem math).
- `src/lib/export/payroll-data.ts` (payroll PDF totals).
- `/api/budget/artist-summary`.
- `/api/tours/[id]/personnel/[memberId]/rates` — the personnel slide (now READ-ONLY display) reads the person's
  rate lines.
- Budget salary/per-diem sections (via the above).
Keep the legacy `personnel_rates.*` columns in place but **frozen** (no longer written/read as authoritative) —
a later cleanup migration drops them once this is verified in production. Don't drop them in this branch.

## Final
Branch off `main`; commit + PUSH; **do not report done until the reconciliation harness passes** (paste output)
and `next build --webpack` is green. Report hash + a click-test: add a rate type → new column appears for
everyone → set an amount → Summary total updates → the 5 legacy types' numbers are unchanged (show the before/
after on a real tour). Flag the delete-a-type behavior you chose (block vs cascade).
