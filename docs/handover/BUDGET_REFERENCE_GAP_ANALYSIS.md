# Reference budget gap analysis — Charlotte Sands "USA Headline '26"

Source: Adam's working Google budget (the standard we must match). Tabs reviewed:
**SUMMARY · ROUTING & INCOME · HOTELS · FLIGHTS · TRANSPORTATION · PROD & MISC ·
EXPENSE RECEIPTS.** Goal: confirm every data-entry feature is matched in Lowpass, flag
gaps. Legend: ✅ matched · ⚠️ partial · ❌ missing.

## 1. Income projection engine — the headline gap (reshapes income Phase 3)
The `ROUTING & INCOME` tab is a **deal-aware projection engine**, far richer than our
Phase-3 plan ("projected merch/VIP = $/head × cap × sellout%"). Per-show inputs:

| Reference input | Lowpass today | Status |
|---|---|---|
| **Cap** (venue capacity, per show, manual) | none (canonical capacity NULL) | ❌ → Phase 3 (we'd planned this) |
| **Est Sell-Thru %** (per show, manual) | none | ❌ → Phase 3 (planned) |
| **Face Value** (ticket price, per show) | none | ❌ **new — drives overage** |
| **Deal %** (`VS 90%`, `PLUS 85%`, thresholds `VS 65% @ 275`) | none | ❌ **new — the core gap** |
| Pre-tax guarantee / **Withholding %** / Post-tax guarantee | `pre_tax_guarantee`, `withholding_pct` | ✅ |
| Pre/Post-tax **Overage** (value) | `pre_tax_overage` | ✅ value, ❌ projection |
| Merch $, **Drop Count**, **$/Head** | `merch_income`, `drop_count` | ⚠️ value yes, formula no |
| **VIP** (proposed + actual) | `vip_income` | ✅ value, ❌ formula |

**The projection formulas the sheet runs (and we don't):**
- **Overage** = `deal% × cap × sell-thru × face − 8% tax − guarantee(if +ve) − WH × 0.65 haircut`. This is the real money in a VS deal — and it needs **deal type, face value, sell-thru, cap, a haircut factor**. Our Phase 3 didn't scope overage projection at all.
- **Merch** = `cap × sell-thru × ($/head NET) × avg fee %` (their numbers: $4.50 net/head × 20% fee). Our planned formula `$/head × cap × sellout%` is the same shape but **misses the net-vs-fee split**.
- **VIP** = `tickets × price × nights` (10 TIX @ $75). Simple; worth a formula option.

**Implication: rewrite Phase 3.** It's not "merch/VIP formula" — it's a per-show income
model with **Cap, Sell-Thru, Face Value, Deal type (VS/PLUS + threshold), Withholding** as
proposed inputs that drive **projected guarantee + overage + merch + VIP**. Deal-type
modeling (VS = greater-of, PLUS = guarantee + %) is the centre of gravity. All of these are
**proposed structure → versioned** (the `budget_version_income` tax applies to each).

## 2. Salary / Payroll — Show/Off/Rehearsal Rate ✅ (CORRECTION — already built)
SUMMARY splits crew/band pay into **Show Rate** and **Off Rate** (× # show / # off days).
**Lowpass already has this** — `personnel_rates` carries `show_rate`, `off_rate`,
`rehearsal_rate`, `per_diem`, `advance_fee`, and a `rate_type` (day_rate / custom), computed
via show/off/rehearsal day counts (`computeTotalFee`). We **match and exceed** the reference
(we also have a rehearsal rate). **No gap.** *(My first draft wrongly flagged this — I
hadn't checked the payroll code. Corrected.)*

## 3. Expense receipts — dual currency + in-budget flag ⚠️
`EXPENSE RECEIPTS`: ID · Date · Vendor · Category · Description · **Cost $ AND Cost £**
(dual-currency, "red denotes currency conversion") · Receipt Image link · **IN BUDGET
(TRUE/FALSE)**. Lowpass receipts have number/vendor/image. Gaps: (a) **dual-currency cost**
on a receipt (native + tour), (b) an **"in budget" toggle** (count this receipt toward
actuals or not — a per-receipt processed flag). Both are easy adds and align with the
currency work.

## 4. Currency — LIVE until settlement, then LOCK to the transaction-date rate ✅ (DECIDED)
**Adam's model (2026-06-25):** projected/proposed foreign income converts at the **LIVE FX
rate** (floats as the market moves); the moment a show **settles (actual transaction date)**,
the rate **LOCKS to that date's rate** — the realised rate when money actually moved. This is
correct mark-to-market accounting: projections float, actuals are realised. It **supersedes
Phase-2's manual-only map**:
- Add a **live-rate source** for projected conversion (e.g. a daily FX fetch), keyed per
  currency → tour currency.
- On **settlement** (Phase-1 sync), **capture + lock** that day's rate onto the income /
  settlement row, so the actual converts at the realised rate forever after.
- Keep the **manual per-tour FX map (Phase 2) as an override/fallback** (no live source,
  or a negotiated rate).
This is a currency follow-up (call it Phase 2.5) — it touches the settlement sync (Phase 1)
and the projected conversion (Phase 2/3).

## 5. Already matched ✅ (no action)
- **Proposed vs Actual** columns throughout — ✅ (est/act).
- **Section subtotals → Total Expenses → Net Income** — ✅ (P&L).
- **Overheads**: Accountancy 5%, Insurance 3%, Contingency 2% (% of a base) — ✅ (Settings).
- **Commissions**: Management 15% / Agency 10% / Legal 0%, base "Gross (Before Tax)", with
  notes — ✅ (Settings commissions, base-selectable).
- **Hotels**: date in/out, city, show, accom, # nights, # rooms, projected/actual, rooming
  list linked — ✅ (Rooming + hotel lines).
- **Expense detail** (Flights: flights/bus/taxis/fuel/parking; Production: audio+backline/
  lighting/freight/equipment/programming/set+wardrobe) — ✅ (sections + line items).
- **%+/- variance** per line — ✅ (variance column).
- **Tour show-days / off-days counts** — ✅ (routing day types).

## Recommended actions (priority order)
1. **Rewrite income Phase 3** as the deal-aware projection engine: add per-show **Cap,
   Sell-Thru, Face Value, Deal type (VS/PLUS + threshold), Withholding**; compute projected
   **guarantee + overage + merch + VIP** (overage with the haircut; merch with net/head ×
   fee). All proposed → versioned. *This is the single biggest match-the-standard item.*
2. ~~Payroll Show/Off rate~~ — **already built** (show_rate/off_rate/rehearsal_rate +
   rate_type). No action.
3. **Receipts: dual-currency cost + "in budget" flag** — small; pairs with currency work.
4. **Currency Phase 2.5** — live rate for projected conversion + **lock the settlement-day
   rate** onto actuals at reconcile; keep the manual map as fallback. (Adam's decided model.)
5. **Phase-4 P&L refresh** should surface the income **projection breakdown** (guarantee /
   overage / merch / VIP, projected vs actual) the way the sheet's bottom block does.
