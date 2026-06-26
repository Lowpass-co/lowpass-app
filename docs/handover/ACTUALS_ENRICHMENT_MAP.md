# ACTUALS_ENRICHMENT_MAP — Stage A (map + plan only; no code, no migration)

> Income #24. Adam: "We should have more info on the ACTUALS side — most of the
> same information as Projected." Today the Income **Actual** view captures only
> the money outputs (Guarantee / Overage / Merch / VIP / Deductions / Net) — no
> real attendance, no real gross box office, so you can't see sell-through accuracy
> or audit where the settled overage came from. The Projected side derives
> everything from Cap × Sell-thru × Face; Actual jumps straight to the money.
>
> **Status:** Stage A — map only. Awaiting Adam + Claude sign-off on the **(a) vs
> (b)** decision + the field set + the variance-rendering choice before any
> schema/code. Mirrors the Stage-A discipline of `INCOME_REDESIGN_MAP.md`.

---

## 1. Current income ACTUALS model

### 1a. `budget_income` actual columns
| Column | Source | Migration |
|---|---|---|
| `actual_guarantee`, `actual_overage`, `actual_merch`, `actual_vip` | settlement-fed + grid-editable | 017 |
| `actual_deductions` | settlement-fed (read-only in grid) | 215 |

**No real attendance / gross / capacity on the actual side.** The PROJECTED
counterparts + inputs (217, all PROPOSED → versioned) are: `capacity`,
`est_sell_thru`, `face_value`, `deal_type`/`deal_pct`/`deal_threshold`/
`deal_pct_above`, `withholding_pct`, `dollars_per_head`, `merch_fee_pct`,
`vip_tickets`, `vip_price`. The actual side has **none** of these — only money.

### 1b. Grid Actual view + Net (`BudgetIncomeGrid.tsx`)
- Columns (`:345-357`): Guarantee / Overage / Merch / VIP (editable `money`),
  **Deductions** (`:354`, `ro:true`, settlement-fed), **Net** (`:357`, a `calc`:
  `guarantee + overage + merch + vip − deductions`). Projected labels the last
  column **"Total"**; Actual labels it **"Net"** (deductions only exist on actual).
- onEdit field map (`:208-211`): `guarantee→actual_guarantee`,
  `overage→actual_overage`, `merch→actual_merch`, `vip→actual_vip`.
- Data mapping (`:412`): from `r.actual_*`.
- **Actual outputs are EDITABLE** (unlike the projected outputs, which the
  projection-fix made computed-locked). `versionLockedCols` for the Actual view is
  `[]` — actuals **never lock** (the versioning rule).

### 1c. How it flows into `computeBudgetPnl`
`grossAct` (`computeBudgetPnl.ts:204-209`) = `Σ (actual_guarantee + actual_overage
+ actual_merch + actual_vip − actual_deductions) × f` (f = the per-show FX rate,
216). The `incomeBreakdown.actual` (`:184-202`) carries `guarAct/overAct/merchAct/
vipAct/dedAct`. So **income_gross (actual) is the sum of the actual MONEY columns
only.** The invariant (`BudgetIncomeGrid.tsx:11-14`): the field names + the upsert
stay identical so `income_gross` is unchanged. **→ Any new field must NOT enter
`grossAct` unless we deliberately derive a money output from it (§3).**

### 1d. The settlement seam (Phase 1 / migration 215)
- `settlement` (017, `UNIQUE(routing_id)`) holds `day_of_*` + `reconciled_*` for
  **guarantee / overage / merch / deductions / net** (+ notes / signed-by / file).
- **It carries NO tickets, NO gross, NO attendance, NO capacity** — confirmed
  against the full schema. So real attendance/gross has **no source of truth today**;
  the new fields would NOT duplicate settlement.
- The settlement POST (`settlement/route.ts:253-264`) **upserts**
  `reconciled_* ?? day_of_*` → `budget_income.actual_guarantee/overage/merch/
  deductions` keyed by `routing_id`. `actual_vip` is omitted (preserved / manual).
  **→ settlement is the authoritative source for the actual MONEY** (its sync
  overwrites `actual_*` on reconcile); the grid hand-edit is the secondary path.

---

## 2. The gap + proposed new actual fields (minimal set)

| New column (on `budget_income`) | Type | Unlocks |
|---|---|---|
| `actual_tickets_sold` | INTEGER | **real sell-through** = `actual_tickets_sold / capacity` (vs projected `est_sell_thru`) |
| `actual_gross` | NUMERIC | **real box office**; gross variance vs projected `cap × est_sell_thru × face`; the "implied overage" audit reference (§3) |

- **`actual_capacity` — recommend NOT adding (yet).** Reuse the projected
  `capacity` as the sell-through denominator (the real cap rarely differs show to
  show; if it does, the user adjusts `capacity`). Add later only if a real cap that
  diverges from projected becomes a need.
- **comps / drops — defer.** Merch `drop_count` already exists; comps are niche.
  Not in the minimal set.
- These are **actual-side, settlement-context** columns: **unversioned** (NOT
  mirrored into `budget_version_income`), **never lock** (`versionLockedCols` for
  the Actual view stays `[]`), **per-show currency** native like the other actual
  money (216 — `actual_gross` displays in the row's `cur`). Hand-entered in the
  grid today; settlement could capture them on reconcile later (a follow-up — the
  `settlement` table would need its own `reconciled_tickets`/`reconciled_gross`).

---

## 3. ⛔ THE central decision — actual Overage DERIVED or settlement-authoritative?

### (a) Derived (mirror Projected)
Feed `actual_gross` + real deal terms into `incomeProjection` → a computed actual
overage (with a manual override, like #28's projected-output override).
- **Pro:** consistent, auditable, true variance on every term.
- **Con:** needs the real **deal terms captured on the actual side too** (deal type/
  pct/threshold on actual, currently only projected); and it **fights the settlement
  authority** — the settled overage (what the promoter actually paid, signed in the
  settlement) is the truth, and a derivation can legitimately disagree (negotiated
  adjustments, taxes, recoupments). The prompt's own rule — "a settlement figure
  always wins over a derivation" — means the derivation would only ever apply to
  un-settled shows, i.e. a second source that must always lose. Net complexity, and
  it **changes `income_gross`** for the derived rows (forbidden without explicit
  sign-off).

### (b) Settlement-authoritative + tickets/gross as real context (RECOMMENDED)
Keep `actual_overage` etc. settlement-fed / hand-entered (today's model); add
`actual_tickets_sold` + `actual_gross` as **real informational numbers + variance**,
**without re-deriving the money**.
- **Pro:** simplest, no double-source, **respects where settlement authority already
  lives** (§1d — the settlement route IS the actual-money source of truth);
  `income_gross` is **unchanged** (tickets/gross never enter `grossAct`).
- **Con:** tickets/gross don't *drive* the overage — they're reporting.

### Recommendation: **(b)**, grounded in the data-model truth
Settlement is already the authoritative source for the actual money (it syncs
`reconciled_* → actual_*`). Re-deriving the overage would create a second source
that the settlement must always override — complexity with no gain, and it would
mutate `income_gross`. Adam's real ask ("more info, sell-through accuracy, audit
where the overage came from") is met by adding the **real attendance + gross as
context + variance**, not by re-deriving the settled money.

**The audit, without the double-source:** show a **computed "implied overage"**
(`deal% × NBOR(actual_gross) − guarantee`, via the engine, READ-ONLY, shown as a
variance/tooltip — never stored, never summed) next to the **settled** overage. You
see at a glance whether the settled figure matches the formula on the real gross —
the audit Adam wants — while the settled number stays authoritative. This keeps
`incomeProjection.ts` untouched (it's reused read-only for the reference only).

---

## 4. Variance rendering

- **Sell-through accuracy:** projected `est_sell_thru` (%) vs **actual**
  `actual_tickets_sold / capacity` (%). → a read-only `calc` column in the Actual
  view (+ a small green/amber Δ).
- **Gross variance:** projected `cap × est_sell_thru × face` vs `actual_gross`. →
  a read-only Δ in the Actual view (or a tooltip).
- **Per-output variance** (guarantee/overage/merch/vip projected vs actual) is
  **already surfaced** in the Summary P&L's income breakdown (P4 / `incomeBreakdown`
  projected + actual). No change needed there.
- **Where:** add **`Tickets sold` + `Gross`** as real Actual columns; surface
  **sell-through %** + **gross Δ** + the **implied-overage reference** as read-only
  `calc`/tooltip cells in the Actual view. **Keep `computeBudgetPnl` unchanged** —
  none of these enter `grossAct`. (A dedicated "Variance" third view is possible but
  heavier; recommend the in-Actual-view columns for v1.)

---

## 5. Blast radius (every surface reading income actuals / income_gross)

| Surface | Change under (b) |
|---|---|
| `BudgetIncomeGrid` Actual view (`:345-357`) | + `Tickets sold`, `Gross` (editable), + `Sell-thru %`, `Gross Δ`, `implied overage` (read-only calc); data map (`:412`); onEdit map (`:208-211`) gains tickets/gross writes; `versionLockedCols` actual stays `[]` |
| `income/route.ts` actual-write path | + `actual_tickets_sold` / `actual_gross` in the body type + merge + payload; **NOT** in `PROPOSED_INCOME` (no lock guard); **NOT** fed to the engine recompute |
| `income.ts` (`ServerIncome`/`IncomeRow`/`toIncomeRows`) | carry the two new actual fields |
| `computeBudgetPnl` | **UNCHANGED** — tickets/gross never enter `grossAct`/breakdown → `income_gross` reconciled, invariant held |
| Versioning (actuals-never-lock) | new actual cols pass `[]` to `versionLockedCols` (already the Actual-view default) — never lock |
| Settlement sync (`settlement/route.ts`) | unchanged for v1 (tickets/gross are grid-entered); a later follow-up adds `reconciled_tickets`/`reconciled_gross` to the settlement table + sync |
| Summary P&L | unchanged (per-output variance already there) |
| **Migration `221`** (see §6) | `ALTER TABLE budget_income ADD COLUMN IF NOT EXISTS actual_tickets_sold INTEGER, actual_gross NUMERIC` — additive nullable, idempotent, down-block; **not** mirrored to `budget_version_income` |

**Does NOT regress:** the projection-fix (projected outputs stay computed-locked —
these are actual fields); B1/B2 versioning (actuals don't lock); per-show currency
216 (`actual_gross` native, displayed via `cur`); the settlement authority (it
still owns the actual money); `incomeProjection.ts` math (untouched — reused
read-only only for the implied-overage reference).

---

## 6. Migration number
Next free is **220** — but **Receipts B2 also wants 220** (`CC_RECEIPTS_B15_B2.md`).
Whichever lands first takes 220; **this one likely takes 221.** Re-confirm across
`main` + active branches at write time (collisions have bitten three times — see
`database/migrations/README.md`). Highest anywhere today = **219**.

---

## Decisions to sign off (then Stage B)
- **(a) vs (b):** **(b) — settlement-authoritative + tickets/gross as real context**,
  with a read-only computed **implied-overage** reference for audit. Does NOT change
  `income_gross`. *(Rec.; grounded in §1d.)* **Adam to confirm vs (a).**
- **Field set:** minimal — `actual_tickets_sold` + `actual_gross` (reuse projected
  `capacity` for sell-through; no `actual_capacity`/comps yet). *(Rec.)*
- **Variance rendering:** in-Actual-view read-only `calc` columns (sell-thru %,
  gross Δ, implied overage); Summary P&L unchanged. *(Rec.)*
- **Migration 221** (or 220 if it wins the race). Additive nullable, idempotent,
  down-block; unversioned (no `budget_version_income` mirror).
- **Settlement capture of tickets/gross** = a flagged follow-up (out of scope for
  the minimal add).

⛔ **No code, no migration.** Stopping for review.
