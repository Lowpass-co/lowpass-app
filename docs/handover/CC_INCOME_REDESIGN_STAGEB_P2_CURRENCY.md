# CC — Income Redesign Stage B, Phase 2 (Per-show currency). Build. Branch off `main`.

Phase 1 (settlement→actuals + deductions) is verified live and on `main`. Phase 2 adds
**per-show currency** so EU shows can be budgeted in EUR while the P&L still totals in one
(tour) currency. Design was locked in `INCOME_REDESIGN_MAP.md` §4 (D-CURRENCY) — this is a
build, not a discovery. **Unlike Phase 1, this carries the `budget_version_income`
versioning tax** because `currency` is *proposed* structure.

## Decisions — LOCKED
- **`budget_income.currency`** — per-show currency (text, nullable; **NULL = tour currency**).
  It's an income concept, lives on `budget_income`, **proposed structure → versioned.**
- **Per-tour FX-rate map** — recommend a small table
  `budget_fx_rates(id, tour_id, workspace_id, currency, rate_to_tour_currency,
  unique(tour_id, currency))`. **Tour-level, UNVERSIONED** (it's a conversion assumption,
  like the Settings overheads — not per-version proposed data). Editable in the budget
  **Settings** tab. If you have a strong reason to prefer a JSON column instead, flag it
  first; otherwise build the table.
- **`computeBudgetPnl`** converts each show's native gross → tour currency via the existing
  `convertToCurrency` + the FX map, then totals in tour currency. The P&L output stays a
  single (tour) currency. Convention: store rate as "1 [currency] = rate [tour currency]";
  match `convertToCurrency`'s existing signature.
- **Actuals**: a settled foreign-currency show keeps the same per-show currency; flat tour
  rate for now (settlement-day rate is a later refinement — out of scope).

## The versioning tax (do all four — mirror how B1/B2 handled the existing proposed cols)
1. **`budget_version_income`** gains `currency` (snapshot it per version).
2. **`PROPOSED_INCOME`** set in `income/route.ts` gains `currency` → a write to it on an
   **approved** version returns **423 `VERSION_LOCKED`**.
3. **Page overlay** (`page.tsx` getProposedIncomeMap / version_income read) returns `currency`.
4. **`BudgetIncomeGrid`** renders the currency cell **read-only when `versionLocked`** (same
   treatment as the other proposed cells). The FX-rate table is NOT versioned — only the
   per-show `currency`.

## Scope
- **Migration `216`** (215 = actual_deductions on main; verify 216 free across branches):
  `budget_income.currency` (text, nullable) + `budget_version_income.currency` (mirror) +
  the `budget_fx_rates` table (RLS workspace-scoped via existing helpers). Additive,
  idempotent, down-block, `npm run db:migrate`.
- **`BudgetIncomeGrid`**: a per-show currency picker (the tour currency + any currency in
  the FX map); show amounts in the row's native currency; currency cell read-only when
  locked. Projected + Actual both respect the per-show currency.
- **Settings tab**: an FX-rate editor (currency → rate) feeding `budget_fx_rates`.
- **`computeBudgetPnl` + `income.ts`**: per-show conversion to tour currency; thread the
  new column through `loadTourIncome` + the version overlay.

## Verify floor (before pushing)
- Set a show to a non-tour currency + add its FX rate → the P&L converts that show's gross
  to tour currency (totals stay one currency, math checks out).
- Approve a version → the currency cell goes **read-only**; a `currency` write to the
  approved version → **423**; unlock → editable again.
- Projected `currency` snapshots into `budget_version_income` (switch versions → the right
  currency shows). Actuals + Phase-1 deductions still correct. `next build --webpack`;
  tsc 0; eslint 0; tokens.

## Hard rules — read this, it's bitten every phase
- **Branch off `main`. Commit to the feature branch and PUSH it. Before reporting, run
  `git log origin/<branch>` and confirm your commit is actually on the remote branch** —
  every recovery this session (B1, B2, canonical, Phase 1) was a commit that landed on a
  local/wrong branch and was never pushed. Don't make it five.
- Don't regress: Phase 1 (settlement/deductions), the versioning lock/approve (B1/B2), P&L
  parity, canonical capture. RLS via existing helpers.
- **Verify before claiming** — name files/lines; push with the hash. I Chrome-verify on a
  preview. Land INC-CUR smoke IDs in `budget.md`.
