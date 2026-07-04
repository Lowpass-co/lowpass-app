# CC — Payroll extensible rate types (b2). MONEY-CRITICAL build. Off `main`. Branch `feat/payroll-rate-types`.

Adam chose b2: user-definable rate types instead of the four hardcoded columns. This redesigns the payroll
rate model + `computeTotalFee`, so it touches money across payroll/budget/exports. **The safety gate is an
automatic reconciliation proof (below) — not a human round.** Build the whole thing, then PROVE non-regression
before reporting done.

> ## 🔒 THE RECONCILIATION INVARIANT (the gate — mandatory)
> The new extensible calc, populated with the four legacy rate types, MUST reproduce the existing
> `src/lib/payroll/fees.test.ts` numbers **exactly** (Richie 4610.63, split 1606.62, flat 2250, rehearsal 500,
> per-diem 90) via a node harness. If it doesn't, the model is wrong — fix it or STOP. This proves the
> redesign didn't move any money. Also: the budget salary/per-diem totals + the payroll export totals must be
> unchanged for the four legacy types (diff a sample).

## The model (pinned — build to this)
Two new tables (migration `228_*`; confirm 228 is free first):
- **`rate_types`** (the catalog — **workspace-scoped**, reusable across tours): `id`, `workspace_id`,
  `name`, `bucket` (`'fee' | 'per_diem'`), `basis` (`'per_day_status' | 'per_active_day' | 'flat_once'`),
  `day_statuses text[]` (for `per_day_status` — which statuses it bills: `show`/`off_travel`/`rehearsal`),
  `order_index`, `is_default bool`. RLS: workspace-scoped (`get_my_workspace_id()`); a global-tier (`workspace_id
  IS NULL`) for the seeded defaults is fine (mirror export_templates).
- **`personnel_rate_lines`** (the amounts — **per tour, per person, per type**): `id`, `tour_id`,
  `roster_personnel_id` (or the same person key `personnel_rates` uses), `rate_type_id`, `amount numeric`,
  unique `(tour_id, person, rate_type_id)`. RLS via tour→workspace.

**Seed the four defaults + advance** so the legacy calc is reproduced exactly:
| Default type | bucket | basis | day_statuses |
|---|---|---|---|
| Show | fee | per_day_status | `['show']` |
| Off / Travel | fee | per_day_status | `['off_travel']` |
| Rehearsal | fee | per_day_status | `['rehearsal']` |
| Per diem | per_diem | per_active_day | — (all engaged days) |
| Advance | fee | flat_once | — (once) |

**Backfill:** for every existing `personnel_rates` row, create `personnel_rate_lines` from the columns
(`show_rate`→Show, `off_rate`→Off, `rehearsal_rate`→Rehearsal, `per_diem`→Per diem, `advance_fee`→Advance).
**Keep the old `personnel_rates` columns in place** (don't drop) during transition — backfill from them, then
route reads through the new model. `internal_rate` stays as-is (admin-only, its own path; not a public rate type).

## The calc (redesign `fees.ts` — the tested single source)
`computeTotalFee` / `computeTotalPerDiem` become a sum over a person's `rate_lines`:
- `bucket='fee'`, `basis='per_day_status'` → `amount × (count of days whose status ∈ day_statuses)`.
- `bucket='fee'`, `basis='flat_once'` → `amount × 1` (week-1 only, mirror the current advance rule).
- `bucket='per_diem'`, `basis='per_active_day'` → `amount × active_days` (feeds `total_per_diem`, NOT `total_fee`).
Total fee = Σ of `fee`-bucket lines; total per-diem = Σ of `per_diem`-bucket lines — preserving today's split.
Update `src/lib/payroll/fees.test.ts` to exercise the new signature AND keep the legacy-equivalence cases.

## Readers to update (each must reconcile — no number changes for legacy types)
`src/app/api/budget/payroll/generate/route.ts` (mirrors the fee math), `src/lib/export/payroll-data.ts`
(payroll PDF totals), `src/app/api/budget/artist-summary/route.ts`, `src/app/api/budget/personnel-rates`
(CRUD → now rate-lines), the budget salary/per-diem sections. Route them through the new model.

## UI (delivers "add more rate types")
- **Payroll Rates grid** (`PayrollRatesSpreadsheet`): dynamic columns — one per `rate_type` (not the four
  hardcoded). Editing a cell writes the `personnel_rate_lines.amount`. Summary totals from the new calc.
- **"Add rate type"** affordance: define `name` + `bucket` + `basis` (+ `day_statuses` for per_day_status).
  New type → a new column for everyone; amounts default 0.
- The personnel slide stays read-only (from the SSOT work) — now shows the dynamic rate lines.

## Hard rules
Branch off `main`; commit + PUSH; **do not report done until the reconciliation node-harness passes** (paste
its output). Migration 228 idempotent + down-block; RLS workspace-scoped; `internal_rate` stays admin-only.
Flag the two design calls for Adam: rate-types are **workspace-scoped/reusable** (values per-tour); the
`bucket`/`basis` model above. Report hash + the reconciliation proof + a click-test (add a rate type → new
column → totals update, legacy numbers unchanged).
