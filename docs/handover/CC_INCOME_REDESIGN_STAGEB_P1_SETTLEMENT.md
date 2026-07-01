# CC — Income Redesign Stage B, Phase 1 (Settlement). GO. Branch off `main`.

`INCOME_REDESIGN_MAP.md` reviewed + claims verified (the upsert gap and the deductions
gap are both real). **Commit the map**, then build Phase 1 only on a fresh branch off `main`.
Phases 2–4 (currency → formula+capacity → P&L refresh) are separate prompts after verify.

## Decisions — LOCKED
- **Upsert the settlement→income sync.** Today `settlement/route.ts` (~239-261) computes
  `actual_guarantee/overage/merch` from `reconciled_* ?? day_of_*` then writes them **only
  `if (incomeRow)` exists** → a settled show with no income row silently loses its actuals.
  Make it an **upsert** (create the `budget_income` row for that `routing_id` if absent).
- **Add `actual_deductions` to income.** Settlement tracks `reconciled_deductions` /
  `day_of_deductions` but they never reach income, so the P&L overstates actual income.
  Sync `reconciled_deductions ?? day_of_deductions` into a new
  `budget_income.actual_deductions`.
- **P&L subtracts it.** `computeBudgetPnl`: **actual** gross income =
  guarantee + overage + merch + vip **− actual_deductions**. (Proposed/projected income is
  unaffected — deductions is actual-only. A dedicated deductions *line* in the P&L is a
  Phase-4 display polish; this phase just must stop the overstatement.)
- **VIP actual stays manual** — settlement has no VIP source; don't touch `actual_vip`.
- **No versioning tax this phase.** `actual_deductions` is an **actual** (one live layer) →
  it does **NOT** mirror into `budget_version_income` and is **NOT** in the `PROPOSED_INCOME`
  lock set. Leave versioning untouched.

## Scope
- **Migration `215`** (214 = canonical-venues, 213 = RAG on main; verify 215 free across
  branches): `ALTER TABLE public.budget_income ADD COLUMN IF NOT EXISTS actual_deductions
  numeric;` — additive, nullable. Down-block. Idempotent. Applied via `npm run db:migrate`.
- **`settlement/route.ts`**: change the post-settlement income write from
  update-if-exists to **upsert on `routing_id`** (workspace-scoped), writing
  `actual_guarantee/overage/merch/deductions`. Don't regress the settlement upsert itself.
- **`computeBudgetPnl.ts`**: subtract `actual_deductions` from the actual income side so
  `NET` reflects real receipts. Proposed side unchanged.
- **`income.ts` (loadTourIncome)** + **`BudgetIncomeGrid`**: surface `actual_deductions` in
  the **Actual** view (read-only / settlement-fed); don't add it to the Projected view.
- **`income/route.ts`**: persist `actual_deductions` on manual edit if you expose it as
  editable (optional — settlement is the writer; manual override is a nice-to-have, your call,
  but it's an actual either way, never versioned).

## Verify floor (before pushing)
- Settle a show that has **no** income row → an income row is created with the actuals
  (upsert proven — this is the data-loss fix).
- Settle a show **with deductions** → `actual_deductions` populated; the P&L's actual income
  drops by exactly that amount (net no longer overstated).
- `actual_vip` stays manual (settlement doesn't overwrite it).
- Proposed/projected income + the versioning lock are untouched (no `budget_version_income`
  change). `next build --webpack`; tsc 0; eslint 0; tokens.

## Hard rules
- **Branch off `main`** (not whatever's checked out). RLS via existing helpers; the income
  write stays workspace-scoped.
- Don't regress: settlement tool, income P&L parity, the versioning lock/approve (B1/B2),
  the canonical capture.
- **Verify before claiming** — name files/lines; push with the hash. I Chrome-verify on a
  preview: settle → income row appears with actuals; deductions reduce the P&L net.
- Land BUD-VER/INC smoke IDs in `budget.md` as they go green.
