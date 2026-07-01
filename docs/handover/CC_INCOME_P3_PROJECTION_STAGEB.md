# CC — Income Phase 3 Stage B: GO. The deal-aware projection engine. Branch off `main`.

`INCOME_P3_PROJECTION_MAP.md` reviewed. **Commit the map.** The structural design is
approved as mapped — crucially the **materialise-into-existing-value-columns** seam (engine
writes `pre_tax_overage`/`merch_income`/`vip_income`; `computeBudgetPnl` + the versioning
lock stay unchanged). Build on a fresh branch off `main`. **One model correction from
Adam's deal-memo answers — read D-DEAL carefully, it differs from the map.**

## Decisions — LOCKED (Adam, 2026-06-25)
- **VS auto-projects; PLUS is MANUAL; FLAT = 0.** PLUS deals are **excluded from
  auto-projection** (matches Adam's real sheet, "PLUS excluded") — `deal_type=PLUS` leaves
  `pre_tax_overage` user-entered, engine writes nothing. Don't build a PLUS formula.
- **`@ N` = a TIERED VS escalator, NOT a breakeven deduction** (the map's reading was wrong).
  The deal % **changes after a ticket-sales threshold**: e.g. "VS 55%, 65% @ 275" = 55% up to
  275 tickets, 65% above. So a VS deal is `{deal_pct (base), deal_threshold (TICKET count,
  nullable), deal_pct_above (escalated %, nullable → = base)}`.
- **Tiering is MARGINAL** (escalated % applies only to tickets *above* the threshold, not the
  whole show). *(If Adam says "cliff" in his go, flip to whole-show-flips-above-threshold.)*
- **Fidelity (confirmed):** tax off the top (% of gross box office); withholding applies to
  the overage too (`×(1−WH)`); overage floored at 0 (`max(0,…)`).
- **Haircut + tax = per-tour config** on `budget_settings` (unversioned), defaults
  **0.65 haircut / 0.08 tax**, same home as the overhead %s + FX map. Not constants.

## The engine (per VS show — the exact math to implement)
```
tickets   = round(Cap × SellThru)
perTicketNBOR = Face × (1 − Tax%)              -- tax off the top
T, p1, p2 = deal_threshold, deal_pct, (deal_pct_above ?? deal_pct)
ArtistShare = (T == null || tickets ≤ T)
              ? p1 × tickets × perTicketNBOR
              : perTicketNBOR × ( p1×T + p2×(tickets − T) )     -- MARGINAL tiering
Overage   = max(0, ArtistShare − pre_tax_guarantee) × (1 − Withholding%) × Haircut
Merch     = Cap × SellThru × DollarsPerHead(net) × MerchFee%
VIP       = VipTickets × VipPrice
```
- **Guarantee** needs no new math (post-tax already derives from `pre_tax_guarantee × (1−WH)`).
- Engine **pre-fills** `pre_tax_overage`, `merch_income`, `vip_income` (computed defaults,
  **user-overridable** — a recompute button or on-input, your call in the map's pattern; the
  value the user sees in the cell is the materialised number, editable).
- **PLUS / FLAT:** engine writes **no overage** (PLUS manual, FLAT 0).

## Scope
- **Migration `217`** (216 = currency on main; verify free): new **proposed input** columns
  on `budget_income` + the `budget_version_income` mirror — `cap, est_sell_thru, face_value,
  deal_type, deal_pct, deal_threshold, deal_pct_above, dollars_per_head, merch_fee_pct,
  vip_tickets, vip_price`. Tour config on `budget_settings`: `default_sell_thru,
  default_dollars_per_head, default_merch_fee_pct, overage_haircut (0.65), overage_tax_pct
  (0.08)`. Additive nullable, idempotent, down-block.
- **Engine** (`src/lib/budget/incomeProjection.ts`, pure + unit-tested) — the math above;
  per-show inputs fall back to tour defaults when null (`est_sell_thru, $/head, fee%`).
- **`BudgetIncomeGrid`** — the new input columns (Projected view); engine pre-fills the
  value cells; inputs read-only when version-locked.
- **Versioning tax (all 5 touchpoints, per the map):** new input cols → `budget_version_income`
  mirror + `PROPOSED_INCOME` (`income/route.ts:126`) + write-through + `getProposedIncomeMap`
  (`versions.ts`) + page overlay + read-only-when-locked. (Outputs already versioned.)

## Verify floor
- A VS show with tiered deal (55%/65% @ 275 tickets) → overage matches a hand-calc of the
  marginal formula; non-tiered VS (no threshold) → flat deal_pct; PLUS/FLAT → no auto overage.
- Engine pre-fills overage/merch/vip; user can override a cell; `computeBudgetPnl` total
  unchanged from the materialised values.
- Approve a version → the new input cells lock (read-only + 423); unlock → editable.
- Per-show input falls back to tour default when null. `next build --webpack`; tsc 0; eslint 0.
- **Unit-test the engine** (VS tiered/non-tiered, floor-at-0, haircut, tax-off-top, fallbacks).

## Hard rules
- **Branch off `main`. Commit to the feature branch and PUSH. Before reporting, run
  `git log origin/<branch>` and confirm the commit is on the remote branch.**
- Don't regress P1 (settlement/deductions), P2 (currency/FX — engine stays currency-agnostic,
  works in the show's native ccy), versioning lock, P&L parity. Migration via `npm run db:migrate`.
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify + hand-calc a
  tiered VS show. INC-PROJ smoke IDs in `budget.md`.
