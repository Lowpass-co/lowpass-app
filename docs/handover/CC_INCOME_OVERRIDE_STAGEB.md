# CC — Income output override (#28 Phase B). Stage B: GO. Build. Branch off `main`.

`INCOME_OVERRIDE_MAP.md` reviewed + both decisions signed off by Adam + Claude. **Commit the map** if it
isn't already on a branch. Decisions LOCKED below. Build the override on a fresh branch off `main`
(`feat/income-output-override`).

## Decisions — LOCKED
- **Storage = Option A.** A per-output boolean flag on `budget_income`: `overage_is_override`,
  `merch_is_override`, `vip_is_override` — `BOOLEAN NOT NULL DEFAULT false`. The override **value lives in
  the existing** `pre_tax_overage` / `merch_income` / `vip_income` column. **No new value columns.**
  `computeBudgetPnl` + the grid read those columns unchanged.
- **Withholding = applies (pre-WH semantics unchanged).** An overridden overage is the **pre-withholding**
  figure, exactly like a computed one. The P&L still derives `post_tax_overage =
  postTaxFromPreTax(pre_tax_overage, withholding_pct)` whether or not the row is overridden — **zero P&L
  change.** The override input is **labeled "pre-WH"** so it's unambiguous.

## Build
1. **Migration (re-confirm the number).** Add the three boolean flags to `budget_income` **and the
   `budget_version_income` mirror** (so an approved snapshot carries the override state). Idempotent
   (`ADD COLUMN IF NOT EXISTS … DEFAULT false`), down-block. **Migration number: the map said 220, but
   re-confirm at write time across `main` + ALL active feature branches** — Receipts B2 and Actuals (#24)
   also want the next slot(s); take the next genuinely-free number and don't collide (this has bitten three
   times — see `database/migrations/README.md`).
2. **Route gate** (`income/route.ts:~219`). Gate each recompute on the flag:
   `recomputeOverage = has(OVERAGE_INPUTS) && !overageIsOverride` (likewise merch/vip). The route must
   **accept + persist** the `*_is_override` flags. When an output is overridden, an input edit recomputes
   the *non*-overridden outputs but **leaves the overridden value untouched**. Setting an override persists
   `{ <value>, *_is_override: true }`; clearing it persists `{ *_is_override: false }` and lets the next
   input edit (or an immediate recompute) refill from the engine. **This explicit boolean is the whole
   point — it structurally cannot reintroduce the persistent-0 freeze** (a stray 0 never sets the flag).
3. **Grid UX** (`BudgetIncomeGrid.tsx`). Today `PROJECTED_OUTPUT_COLS` (`:53`) are unconditionally
   read-only. Make the per-cell `ro` predicate **`isOutput && !rowIsOverridden(col)`** (mirror the
   `isVersionLocked` per-cell precedent — this is the real grid-core seam). Right-click a read-only output →
   **"Override formula"** → warning ("this output stops tracking the formula; the P&L uses your number") →
   the cell becomes **editable + flagged with a distinct marker (NOT the ƒ)**; the edit input is labeled /
   tooltipped **"pre-withholding"**. **Deleting an overridden value → "Revert to formula?"** → clears the
   flag → the engine recomputes (back to ƒ read-only). A non-overridden output stays computed-locked + ƒ.
4. **Versioning.** Overrides live on the **draft** and lock with it. The `*_is_override` flags snapshot
   into `budget_version_income` on approve, and the **`budget_version_rollback` RPC (219)** must carry them
   like any other versioned column. An approved/rolled-back version's overrides are read-only (the existing
   non-draft lock). Actuals are unaffected (override is Projected-only).

## Hard rules
- **Branch off `main`. Commit + PUSH. Confirm `git log origin/<branch>` before reporting.**
- **Don't reintroduce the persistent-0 bug** — the override is an explicit user action that sets the flag;
  an unset flag always recomputes. Don't regress the projection fix (computed-lock + `—` blank), B1/B2
  versioning (incl. the rollback RPC carrying the new columns), the income phases, or the #28 Phase A polish
  (type-to-select / number boxes / column hide-show) if it's merged ahead of this.
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0. Smoke IDs INC-OVR-01..04 in `docs/smoke-tests/budget.md`.
- **Verify before claiming** — name files/lines; push the hash. Reproduce: VS row computes overage →
  right-click → Override → type a number → it sticks through an unrelated input edit; the P&L applies WH to
  it; delete → reverts to the formula; approve → the override locks + snapshots; an input edit never
  silently freezes a non-overridden output.
