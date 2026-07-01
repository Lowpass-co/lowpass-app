# CC — Income ACTUALS enrichment (#24). Stage A (map + plan only). Gated.

Adam: *"We should have more info on the ACTUALS side — most of the same information as Projected."*
Today the Income **Actual** view captures only the money outputs (Guarantee / Overage / Merch / VIP /
Deductions / Net). It has **no real attendance and no real gross box office**, so you can't see
sell-through accuracy (projected vs actual tickets) or audit where the settled overage came from. The
Projected side derives everything from Cap × Sell-thru × Face; the Actual side jumps straight to the money.
Close that gap so Actual mirrors Projected with **real settled numbers**, driving true variance.

**Stage A is a map + fix plan only — no code, no migration — reviewed by Adam + Claude before build.**

## ⛔ Stage A — MAP ONLY → `ACTUALS_ENRICHMENT_MAP.md`

1. **Map the current income actuals model.**
   - `budget_income` actual columns: `actual_guarantee`, `actual_overage`, `actual_merch`, `actual_vip`,
     `actual_deductions` (215, settlement-fed, read-only). Note the **projected** counterparts and inputs
     (`capacity`, `est_sell_thru`, `face_value`, deal terms, `withholding_pct`, `dollars_per_head`,
     `merch_fee_pct`, `vip_tickets`, `vip_price`).
   - The Actual-view column set + Net calc in `BudgetIncomeGrid.tsx` (`:349-357` — Net = guarantee +
     overage + merch + vip − deductions; the **projected** "Total" vs actual "Net" labels).
   - **How `income_gross` flows into `computeBudgetPnl`** — and the invariant at `BudgetIncomeGrid.tsx:13`
     ("the projected/actual money totals stay identical so `computeBudgetPnl`'s `income_gross` is
     unchanged"). Any new field must NOT silently change `income_gross` unless we deliberately derive a
     money output from it.
   - The settlement seam (Phase 1 / migration 215): what writes `actual_deductions` today, and whether a
     settlement record already carries real tickets/gross elsewhere (check `settlement`/`reconciled_*`
     references) so we don't duplicate a source of truth.

2. **The gap + the proposed new actual fields.** Propose the columns to add to `budget_income` (and the
   Actual grid): at minimum **`actual_tickets_sold`** (real attendance) and **`actual_gross`** (real box
   office). Decide whether to also add **`actual_capacity`** (real cap, often = projected) and
   **comps/drops** — recommend the minimal set that gives real sell-through (`actual_tickets_sold /
   capacity`) and a real gross, and say what each unlocks.

3. **THE central decision — is actual Overage DERIVED or hand-entered?** Two models, pick one with a
   recommendation:
   - **(a) Derived (mirror Projected):** feed `actual_gross` + the **real** deal terms into the **same
     `incomeProjection` engine** → a *computed* actual overage (with a manual override, like #28's
     projected-output override). Pro: consistent, auditable, true variance on every term. Con: needs the
     real deal terms captured on the actual side too, and must respect the "settlement is authoritative"
     rule (a settlement figure always wins over a derivation).
   - **(b) Settlement-authoritative (today + tickets/gross as context):** keep `actual_overage` etc.
     hand-entered / settlement-fed; add `actual_tickets_sold` + `actual_gross` as **informational** real
     numbers + variance, *without* re-deriving the money. Pro: simplest, no double-source. Con: tickets/
     gross don't drive the overage — they're just reporting.
   - Recommend based on the data-model truth (where does settlement authority live?) — **do not assume**.

4. **Variance.** Propose how to surface projected-vs-actual: sell-through accuracy
   (`est_sell_thru` vs `actual_tickets_sold/capacity`), gross variance, and per-output variance. Where does
   it render — new Actual columns, a variance strip, or the Summary P&L? Keep `computeBudgetPnl` correct.

5. **Blast radius.** List every surface that reads income actuals or `income_gross`: `BudgetIncomeGrid`
   (Actual view + the `onEdit` field map at `:208-211`), `income/route.ts` (the actual-write path),
   `computeBudgetPnl` (income breakdown + Net), the versioning **actuals-never-lock** rule (new actual
   columns must also never lock — they pass `[]` to `versionLockedCols`), the settlement sync, and the P&L.
   Confirm the new fields don't regress the projection fix (outputs computed-locked), B1/B2 versioning, or
   the per-show currency (216).

6. **Migration number.** Next free is **220 — but Receipts B2 also wants 220** (per
   `CC_RECEIPTS_B15_B2.md`). Whichever lands first takes 220; flag that this one likely takes **221**.
   Re-confirm across `main` + active branches at write time. (Plan the column adds idempotent, down-block.)

Surface the **(a) vs (b)** decision + the field set + the variance-rendering choice with recommendations.
**Then stop. No code.**

## Hard rules
- **Branch off `main`. Commit the map + PUSH. Confirm `git log origin/<branch>` before reporting.**
- Stage A is a doc — name real files/lines.
- Don't propose anything that changes `income_gross` for existing rows (the projected/actual totals must
  stay reconciled) unless the (a)-derivation decision explicitly, deliberately does so with Adam's sign-off.
- Respect the invariants: actuals NEVER lock (versioning); settlement is authoritative; per-show currency
  (216) stays; the projection engine math (`incomeProjection.ts`) is not touched.
