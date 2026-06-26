# INCOME_P3_PROJECTION_MAP — Stage A (map + decisions only; no schema, no code)

> **Income Phase 3 REWRITE — the deal-aware projection engine.** The original
> Phase 3 ("projected merch/VIP = $/head × cap × sellout%") was underscoped.
> Adam's reference budget (`BUDGET_REFERENCE_GAP_ANALYSIS.md` §1, the *ROUTING &
> INCOME* tab) is a per-show, deal-aware engine that projects **guarantee +
> overage + merch + VIP** from **Cap, Sell-Thru, Face Value, Deal type, Withholding**.
> This is the single biggest "match the standard" item.
>
> **Status:** Stage A — map only. Awaiting Adam + Claude sign-off on **D-DEAL /
> D-HAIRCUT / D-TAX / D-FIDELITY** + the defaults-vs-override split before any
> schema or UI. Mirrors the Stage-A discipline of `INCOME_REDESIGN_MAP.md`.
> Phase 1 (settlement→actuals + deductions) and Phase 2 (per-show currency + FX)
> are **on main** (`e422828`); this builds on both.

---

## 1. Current income model — where the projection slots in

**Everything the engine would compute is hand-typed today.** The four income
value columns are manual cells in the grid:

- **`budget_income`** (`UNIQUE(routing_id)`): proposed value columns
  `pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income`
  (+ derived `post_tax_guarantee/post_tax_overage`); Phase 2 added **`currency`**
  (per-show native ccy, NULL = tour). Actuals `actual_guarantee/overage/merch/vip`
  + `actual_deductions` (Phase 1). No projection *inputs* exist (no cap, no
  sell-thru, no face value, no deal type).
- **`BudgetIncomeGrid.tsx`** — the **Projected** view renders these four as
  editable money cells, hand-typed:
  - `guarantee` → `pre_tax_guarantee` (`:165` `pMoney('guarantee'…)`)
  - `wh` → `withholding_pct` (`:169`)
  - `posttax` → **derived** `postTax(guarantee, wh)` (`:170`, calc, not stored)
  - `overage` → `pre_tax_overage` (`:172`)
  - `merch` → `merch_income` (`:173`)
  - `vip` → `vip_income` (`:174`)
  - `currency` → `budget_income.currency` (Phase 2, `:158`)
  - `total` → calc (`:181`)
  `patchFor` (`:98-115`) maps column → field; `onEdit` (`:117-147`) POSTs each
  cell. **No formula** — the user types every number.
- **`computeBudgetPnl.ts`** — `IncomeInput` (`:86-103`) reads the value columns;
  the income loop (`:162-190`) totals **gross = post-tax guarantee + post-tax
  overage + merch + VIP**, each `× f` where `f = toTourCurrency(1, currency, …)`
  (Phase 2, `:171`). **The P&L consumes the materialised value columns — it does
  not know about projection inputs.** *(This is the key seam: if the engine
  pre-fills the value columns, `computeBudgetPnl` is unchanged.)*
- **`budget_version_income`** — proposed snapshot mirror; `ProposedIncome`
  (`versions.ts:88-96`) = the five value columns + `currency`; `getProposedIncomeMap`
  selects them (`:105`) and the page overlays them onto the draft/approved view
  (`page.tsx:289-300`).
- **`income/route.ts`** — `PROPOSED_INCOME` lock set (`:126`) currently
  `[pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income,
  currency]`; a write to any on an approved version → **423** (`:127-135`);
  write-through mirrors them into the draft's `budget_version_income` (`:199-207`).
- **`income.ts`** — `ServerIncome` / `IncomeRow` / `toIncomeRows` carry the value
  columns + `currency`; `loadTourIncome` reads them.

**Slot-in point (the whole design in one line):** add **projection *input*
columns** (cap, sell-thru, face, deal_type/pct/threshold, $/head, fee%, vip
tickets/price) as new **proposed** structure; an **engine** computes
guarantee/overage/merch/VIP from them and **pre-fills the existing value columns**
(`pre_tax_overage`, `merch_income`, `vip_income`; guarantee already derives
post-tax from `pre_tax_guarantee × (1−wh)`). The value columns stay the P&L's
source of truth → `computeBudgetPnl` needs **no change**. The inputs are proposed
→ **versioned** (the tax in §7).

---

## 2. The reference engine (the spec, per show)

From `BUDGET_REFERENCE_GAP_ANALYSIS.md:23-26`. Restated as the standard touring
math, with the variables named:

```
GBO   (gross box-office potential) = Cap × SellThru × FaceValue
NBOR  (net box-office receipts)    = GBO − Tax            (Tax ≈ 8% of GBO, "off the top")
ArtistShare                        = Deal% × NBOR
Guarantee(post-tax)                = pre_tax_guarantee × (1 − Withholding%)   ← already have
Overage  (VS deal)                 = max(0, ArtistShare − Guarantee) × (1 − WH%) × Haircut(0.65)
Merch                              = Cap × SellThru × DollarsPerHead(net) × MerchFee%
VIP                                = VipTickets × VipPrice   (× Nights — see §5 note)
```

- **Guarantee** — we already have the pieces (`pre_tax_guarantee`,
  `withholding_pct`, derived `post_tax_guarantee`). No new math.
- **Overage** — **the real money in a VS deal, and we compute none of it today.**
  Needs Deal type, Deal%, Face, Sell-Thru, Cap, a tax rate, a haircut.
- **Merch** — `Cap × SellThru × $/head(net) × fee%` (their numbers: $4.50 net/head
  × 20% fee). Same *shape* as the old plan but adds the **net-vs-fee split**.
- **VIP** — `tickets × price` (their example 10 TIX @ $75). Simple.

---

## 3. ⛔ D-DEAL — how to model the deal (THE CRUX — needs Adam's confirmation)

Touring deals split two ways; **VS and PLUS compute overage differently**, so the
engine must branch on `deal_type`. My proposed model + the math for each:

**Proposed:** `deal_type ∈ {VS, PLUS, FLAT}` + `deal_pct` (fraction) + optional
`deal_threshold` (numeric, native ccy).

- **`VS` (versus = "greater of").** Artist earns the **greater of** the guarantee
  **or** `Deal% × NBOR`. The *overage* is the excess of the % over the guarantee:
  ```
  Overage = max(0, Deal% × NBOR − Guarantee) × (1 − WH%) × Haircut
  ```
  `deal_threshold` **unused** for a pure VS (the guarantee *is* the comparison
  point). This is exactly the gap-analysis formula (`:24`), which subtracts
  "guarantee(if +ve)" — confirming the sheet's formula is the **VS** case.

- **`PLUS` (guarantee-plus / "backend").** Artist earns the guarantee **plus** a
  percentage of receipts **above a threshold** (the promoter recoups costs /
  reaches a split point first):
  ```
  Overage = Deal% × max(0, NBOR − Threshold) × (1 − WH%) × Haircut
  ```
  `deal_threshold` = the **split point** (promoter costs / breakeven). Guarantee is
  **not** subtracted (it's additive, not a floor).

- **`FLAT` (guarantee-only).** No backend. `Overage = 0`. (Covers fixed-fee shows
  so the deal picker has a "no overage" option.)

### ⚠️ Surface for Adam — the "@ 275" threshold semantics (genuinely ambiguous)
The reference writes deals as **`VS 65% @ 275`** (`gap-analysis:17`). The `@ 275`
is **not** unambiguously a PLUS threshold — it appears on a **VS** label. Two
readings, materially different money:
1. **`@ N` = promoter costs / breakeven** deducted from NBOR *before* the % split
   (a "split point" applied to **both** VS and PLUS). Then VS overage becomes
   `max(0, Deal% × (NBOR − N) − Guarantee) × …`. → threshold is a **third NBOR
   adjustment**, orthogonal to deal type.
2. **`@ N` = the guarantee** expressed in the deal shorthand (e.g. `275` = $2,750
   or $27,500), i.e. just a restatement of `pre_tax_guarantee` — no separate field.
3. **`@ N` = face value** ($275 ticket) — unlikely given Cap×Face is separate, but
   listed for completeness.

**Recommendation:** model `deal_type {VS, PLUS, FLAT}` + `deal_pct` + a nullable
`deal_threshold`, and treat the threshold as **reading (1): promoter
costs/breakeven deducted from NBOR before the split**, applicable to both VS and
PLUS. It's the most common touring meaning and degrades cleanly (NULL threshold →
no deduction). **But this needs Adam's deal-memo confirmation before build —
naming the wrong threshold semantics silently mis-budgets every VS show.**

---

## 4. ⛔ D-HAIRCUT / D-TAX — config vs constants

The overage formula carries two magic numbers: the **0.65 haircut** (bank only 65%
of projected overage — budgeting conservatism) and the **8% tax** (`NBOR = GBO −
8%`). Where do they live?

- **Options:** (a) hardcoded constants in the engine; (b) **per-tour config**
  (default to 0.65 / 0.08, overridable in budget Settings).
- **Recommendation: (b) per-tour config, unversioned** — same home and rationale
  as the overhead %s and the FX map (both already tour-level, unversioned
  "conversion assumptions" in Settings). Tax rate varies by market (US facility/
  ticket tax ≠ EU VAT treatment); the haircut is a risk-appetite dial Adam will
  want to tune per tour. Constants would force a code change per deal. Store as
  `tax_pct` + `overage_haircut` alongside the existing overheads (extend
  `budget_settings`, or a sibling table). **Unversioned → no `budget_version_income`
  mirror** (consistent with overheads/FX). Defaults: `tax_pct = 0.08`,
  `overage_haircut = 0.65`.

---

## 5. Schema proposal — new PROPOSED input columns (for review, not to build)

### Per-show, on `budget_income` (proposed structure → **versioned**, §7)
| Column | Type | Meaning | Notes |
|---|---|---|---|
| `capacity` | INT NULL | venue cap for this show | per-show (varies nightly). Pre-fill from `canonical_venues.capacity` when populated — **NULL everywhere today** (Adam 2026-06-25), so manual-entry for now. |
| `est_sell_thru` | NUMERIC NULL | sell-through fraction (0–1) | NULL → tour default (§6) |
| `face_value` | NUMERIC NULL | ticket face price | **in the show's `currency`** (Phase 2). Drives GBO. |
| `deal_type` | TEXT NULL | `VS` / `PLUS` / `FLAT` | the D-DEAL branch |
| `deal_pct` | NUMERIC NULL | deal percentage (fraction) | e.g. 0.65 |
| `deal_threshold` | NUMERIC NULL | split point (native ccy) | semantics = D-DEAL ⚠️ |
| `merch_dollars_per_head` | NUMERIC NULL | **net** $/head | NULL → tour default |
| `merch_fee_pct` | NUMERIC NULL | avg merch fee fraction | NULL → tour default |
| `vip_tickets` | INT NULL | VIP ticket count | |
| `vip_price` | NUMERIC NULL | VIP price (native ccy) | |

*(`withholding_pct` and `pre_tax_guarantee` already exist as proposed columns —
reused as engine inputs, not re-added. `drop_count` already exists; it's an
actual-side merch count, not a projection input — leave as-is.)*

### Per-tour defaults + config — on `budget_settings` (or sibling), **UNVERSIONED**
| Setting | Default | Used by |
|---|---|---|
| `default_sell_thru` | — | merch + overage when per-show `est_sell_thru` NULL |
| `default_dollars_per_head` | — | merch when per-show NULL |
| `default_merch_fee_pct` | — | merch when per-show NULL |
| `tax_pct` | 0.08 | NBOR (D-TAX) |
| `overage_haircut` | 0.65 | overage (D-HAIRCUT) |

**Defaults-vs-override recommendation:** the **structural** per-show facts (cap,
face, deal type/pct/threshold, VIP tix/price) live **only** per-show (no
meaningful tour default). The **rate-ish assumptions** (sell-thru, $/head, fee%)
get a **tour default + nullable per-show override** — most shows share one number,
some venues differ. Resolve at compute time as `override ?? tourDefault`. Config
(tax, haircut) is tour-only. This puts versioned structure on the income row and
unversioned assumptions in Settings — the same split Phase 2 used for
`currency` (versioned) vs the FX map (unversioned).

### ⚠️ VIP "nights" note
The spec writes VIP as `tickets × price × nights`. Each routing row is **one
show-night**, so per-row `nights` is normally 1 and redundant. Multi-night holds
on a single routing row are the only case needing it. **Recommend: omit `nights`
(implicit 1 per routing row);** if multi-night runs need it later, add
`vip_nights INT DEFAULT 1`. Flag for Adam — depends on whether a residency is one
routing row or several.

---

## 6. D-FIDELITY — replicate the sheet exactly, vs a simplified variant

- **Recommendation: replicate the reference formula exactly.** It *is* the
  standard the budget must match; a simplified variant would re-introduce the gap
  this rewrite exists to close. Build the VS/PLUS/FLAT branches and the
  tax→NBOR→share→haircut chain as written.
- **But the sheet's formula string is ambiguous in ≥4 places — confirm each with
  Adam before build** (precedence/scope can't be inferred safely):
  1. **Tax base.** Is the 8% off **gross** box office (`GBO × 0.92`, recommended)
     or off the artist's share? Standard = off the top of gross. **Confirm.**
  2. **WH scope.** `withholding_pct` already produces `post_tax_guarantee`. Does
     the **same** WH also apply to the overage (recommended — it's the artist's
     foreign-earnings withholding on all income), and is it the same rate?
     **Confirm.**
  3. **Operator precedence** in `… − 8% tax − guarantee(if +ve) − WH × 0.65`.
     Reading it as `(Deal%×NBOR − Guarantee) × (1−WH) × 0.65` (recommended) vs the
     literal left-to-right subtraction gives different numbers. **Confirm the
     parenthesisation.**
  4. **`guarantee(if +ve)` / overage floor.** Overage floors at 0 when the % is
     below the guarantee (VS = greater-of), recommended. **Confirm.**
  Plus the **threshold semantics** from D-DEAL §3.
- **Validation target:** reproduce the reference show's overage to the dollar
  against Adam's Charlotte Sands sheet before the engine is trusted (mirror the
  `computeBudgetPnl` golden-number test against the GN SUMMARY, `computeBudgetPnl.ts:23-25`).

---

## 7. Formula behaviour — computed default, user-overridable + the versioning lock

**Pre-fill, don't lock.** The engine computes guarantee/overage/merch/VIP and
writes them into the **existing proposed value columns** (`pre_tax_overage`,
`merch_income`, `vip_income`; guarantee already derives). The user can still type
over any cell — a *computed default*, not a frozen output.

Two implementation shapes (a build-time decision; recommendation flagged for Adam):

- **(A) Materialise on input-change (recommended).** When a projection input
  changes, recompute and write the value column(s). **`computeBudgetPnl` and the
  P&L stay byte-unchanged** (they keep reading the materialised value columns);
  the version snapshot captures the materialised number for free. Cost: a manual
  override is "sticky" until the user re-runs the engine, and a changed *tour
  default* doesn't retro-update already-materialised shows (a **"Recalculate"
  action** re-fills from inputs). Simplest path that preserves the lock model.
- **(B) Derive on read.** Store only inputs; compute outputs live in the P&L.
  Needs a per-field "manual override" flag and a `computeBudgetPnl` change (it'd
  have to run the engine). More moving parts; rejected for v1.

**Interaction with the versioning lock (clean):**
- **Inputs** (cap, sell-thru, face, deal_*, $/head, fee%, vip tix/price) are
  **proposed structure → versioned** → read-only when locked (join `PROPOSED_INCOME`).
- **Outputs** (`pre_tax_overage`, `merch_income`, `vip_income`) are **already**
  versioned proposed columns (B1/B2) → already read-only when locked.
- So on an **approved** version both inputs and the materialised outputs are
  frozen and mutually consistent; the engine only ever runs on a **draft**. No new
  lock surface — just more columns in the existing one.

---

## 8. Versioning tax — every new proposed input mirrors (the discipline)

For **each** new per-show input column in §5 (the 10 income-row columns), all five
touchpoints, exactly as Phase 2 did for `currency`:

1. **`budget_version_income`** gains the mirror column (migration).
2. **`income/route.ts` `PROPOSED_INCOME`** (`:126`) gains the column → write on an
   approved version → **423**; write-through upsert into the draft mirror (`:199-207`).
3. **`getProposedIncomeMap` + `ProposedIncome`** (`versions.ts:88-96`, select `:105`)
   return the column.
4. **`page.tsx`** version overlay (`:289-300`) copies it onto the row.
5. **`BudgetIncomeGrid`** renders the input cell **read-only when `versionLocked`**
   (the `ro: versionLocked` pattern already on the currency col, `:158`).

**The per-tour config/defaults (§4–§6: tax, haircut, sell-thru/$/head/fee%
defaults) are UNVERSIONED** — they live in `budget_settings`, like overheads and
the FX map; **no mirror, no lock**.

---

## 9. Blast radius + migration

| Surface | Change |
|---|---|
| `budget_income` | + 10 proposed input cols (§5) |
| `budget_version_income` | mirror those 10 (versioning tax §8) |
| `budget_settings` (or sibling) | + `default_sell_thru`, `default_dollars_per_head`, `default_merch_fee_pct`, `tax_pct`, `overage_haircut` (unversioned) |
| **NEW** `src/lib/budget/projectIncome.ts` | pure engine: inputs + config → {guarantee, overage, merch, vip}; VS/PLUS/FLAT branch; golden-number tested |
| `income/route.ts` | extend `PROPOSED_INCOME`; persist inputs; **materialise** outputs into value cols on write (shape A) |
| `BudgetIncomeGrid` | input columns (cap/sell-thru/face/deal/$head/fee/vip), a **Recalculate** affordance, read-only-when-locked; the projected value cells show computed defaults |
| `income.ts` | `ServerIncome`/`IncomeRow`/`toIncomeRows` carry the inputs |
| `page.tsx` | overlay the new proposed inputs from `version_income` |
| `computeBudgetPnl` | **no change** (reads materialised value cols) — shape A's payoff |
| `BudgetSettingsTab` | a "Projection defaults" card (sell-thru/$head/fee/tax/haircut) |
| Settings API | persist the new tour defaults/config |

- **Migration `217`** — 215 = `actual_deductions`, **216 = per-show currency**
  (both on main, `e422828`); 217 is the next free number (verify across active
  branches at write time — collisions have bitten this repo). One migration:
  income input cols + the `budget_version_income` mirror + the `budget_settings`
  config extension.

---

## 10. Out of scope for P3 (note where it touches — don't build)

- **Currency Phase 2.5** (`gap-analysis §4`, Adam-decided): **live FX** for
  projected conversion + **lock the settlement-day rate** onto actuals. *Coupling:*
  `face_value` and every projected output are in the show's **native `currency`**
  (Phase 2); the engine stays **currency-agnostic** (computes in native units) and
  the P&L converts via `toTourCurrency` (`computeBudgetPnl.ts:171`). 2.5 would
  swap the **rate source** (manual map → live + settlement-locked) **without
  touching the engine** — the seam is already where it should be. Flag, don't build.
- **P&L visual refresh** = Phase 4 (`INCOME_REDESIGN_MAP.md §5`, D-PNL). P4 should
  surface the projection breakdown (guarantee / overage / merch / VIP, projected
  vs actual) the way the sheet's bottom block does.
- **Receipts dual-currency + "in budget" flag** (`gap-analysis §3`) — separate,
  pairs with currency work.

---

## Decisions to sign off (then Stage B, phased)
- **D-DEAL** (the crux): `deal_type {VS, PLUS, FLAT}` + `deal_pct` + nullable
  `deal_threshold`; VS = `max(0, %×NBOR − guarantee)`, PLUS = `%×max(0, NBOR −
  threshold)`, FLAT = 0. **⚠️ Confirm the `@ N` threshold semantics** (promoter
  costs vs guarantee-restatement vs face). *(Rec. above.)*
- **D-HAIRCUT / D-TAX:** per-tour config in Settings, defaults 0.65 / 0.08,
  **unversioned**. *(Rec.)*
- **D-FIDELITY:** replicate the sheet exactly; **confirm the 4 formula
  ambiguities** (tax base, WH scope, precedence, overage floor) before build. *(Rec.)*
- **Defaults vs override:** structural facts per-show; sell-thru/$head/fee% =
  tour default + nullable per-show override; config tour-only. *(Rec.)*
- **Formula behaviour:** shape **(A) materialise** (pre-fill the value columns,
  user-overridable, `computeBudgetPnl` unchanged, "Recalculate" re-runs). *(Rec.)*
- **VIP nights:** omit per-row `nights` (1 per routing row) unless residencies are
  single rows. *(Rec. — Adam to confirm.)*
- **Migration 217.** **Phasing suggestion:** B1 = schema + engine + materialise
  (no UI), B2 = grid input columns + Recalculate, B3 = Settings defaults card,
  each carrying its `budget_version_income` tax.

⛔ **No schema, no code.** Stopping for review.
