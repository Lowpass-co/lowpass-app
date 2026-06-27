# Income ACTUALS enrichment — Stage-A MAP (#24)

> **MAP + FIX-PLAN ONLY. No code, no migration.** Reviewed by Adam + Claude before
> build.
>
> Adam: *"We should have more info on the ACTUALS side — most of the same
> information as Projected."* Today the Income **Actual** view captures only money
> outputs (Guarantee / Overage / Merch / VIP / Deductions / Net). There's no real
> attendance and no real gross box office, so you can't see sell-through accuracy
> (projected vs actual tickets) or audit where the settled overage came from. Close
> the gap so Actual mirrors Projected with real settled numbers → true variance.

---

## 1. Current income-actuals model

### budget_income — the live actuals layer (NOT versioned)

| Actual column | Added | Fed by |
|---|---|---|
| `actual_guarantee` | 017 | settlement cascade (or hand-entered) |
| `actual_overage` | 017 | settlement cascade (or hand-entered) |
| `actual_merch` | 017 | settlement cascade (or hand-entered) |
| `actual_vip` | 017 | **manual only** (settlement has no VIP source) |
| `actual_deductions` | 215 | settlement cascade (read-only in grid) |
| `drop_count` | 017 | manual (comps/drops count — already exists) |

Projected counterparts + their inputs (migration 217, the projection engine drives
them): `capacity`, `est_sell_thru`, `face_value`, `deal_type` / `deal_pct` /
`deal_threshold` / `deal_pct_above`, `withholding_pct`, `pre_tax_guarantee`,
`dollars_per_head`, `merch_fee_pct`, `vip_tickets`, `vip_price` →
`pre_tax_overage` / `merch_income` / `vip_income`.

**The asymmetry:** Projected DERIVES the money from `Cap × Sell-thru × Face × deal
terms`; Actual jumps straight to the money. No real tickets, no real gross.

### Actual-view column set + Net (BudgetIncomeGrid.tsx)

`src/components/budget/BudgetIncomeGrid.tsx` Actual view (~`:419-428`):
`Guarantee · Overage · Merch · VIP · Deductions (ro) · Net`, where
**Net = guarantee + overage + merch + vip − deductions** (`:428`). Projected view
labels the rollup **"Total"**; Actual labels it **"Net"** (matches settlement's
`reconciled_net`). The Actual onEdit field map (`patchFor`, `:208-211`) →
`actual_guarantee` / `actual_overage` / `actual_merch` / `actual_vip`.

### income_gross flow + the invariant

`src/lib/budget/computeBudgetPnl.ts:190-221` loops income rows and accumulates
(per show, converted to tour currency via `toTourCurrency`):

```
grossAct += (actual_guarantee + actual_overage + actual_merch + actual_vip − actual_deductions) × f
```

`incomeBreakdown` (`:372`) exposes guarantee/overage/merch/vip/deductions pairs.
The grid's header invariant (`BudgetIncomeGrid.tsx:13`): the income field names +
the `post_tax = pre_tax × (1 − wh/100)` rule + the `/api/budget/income` upsert stay
identical so **`computeBudgetPnl`'s income_gross is unchanged**.

> **Hard constraint:** any new actual field must NOT enter `grossAct` / `preTaxAct`
> (`:204-220`) — i.e. must not change income_gross for existing rows — UNLESS we
> deliberately derive a money output from it with Adam's explicit sign-off. Real
> tickets/gross are **informational** under the recommended plan, so income_gross
> is untouched.

### The settlement seam (the authority)

There IS a real settlement record — **`settlement` table** (migration 017, `:221-246`),
one per show (`UNIQUE(routing_id)`), `status` = `pending | day_of_complete |
reconciled`:
- `day_of_*` and `reconciled_*` for **guarantee / overage / merch / deductions /
  net**, `reconciled_at`, signed-by, notes, deal-memo text/file.
- **No tickets and no gross box office anywhere on it.**

Writer: `src/app/api/budget/settlement/route.ts:239-265` — on settlement upsert it
cascades into `budget_income` actuals, preferring reconciled over day-of:
```
actual_guarantee  ← reconciled_guarantee  ?? day_of_guarantee
actual_overage    ← reconciled_overage    ?? day_of_overage
actual_merch      ← reconciled_merch      ?? day_of_merch
actual_deductions ← reconciled_deductions ?? day_of_deductions
(actual_vip is NOT cascaded — settlement isn't a VIP source → manual)
```

**Authority verdict:** settlement is authoritative where a record exists; otherwise
the grid's Actual cells are hand-entered (the income route's `nullableMerge`,
`route.ts` actual-write path). Both write the same `budget_income.actual_*` columns
— a single materialised layer the P&L reads.

`deal_memos` (053) carries CONTRACT figures (`fee_amount`, `deposit_amount`,
`settlement_method`) — **not** actuals; not a settlement source. `routing.venue_capacity`
(015) exists but is venue capacity, not real attendance.

---

## 2. The gap + proposed new actual fields

Real attendance and real gross box office exist **nowhere** today. Proposed minimal
set (gives true sell-through + a real gross, nothing redundant):

| New field | Where | Unlocks |
|---|---|---|
| `actual_tickets_sold` (int) | `budget_income` + `settlement` | real sell-through = `actual_tickets_sold / capacity`; vs projected `est_sell_thru` |
| `actual_gross` (numeric) | `budget_income` + `settlement` | real box office; gross variance vs projected `Cap×Sell×Face`; the audit base behind a settled overage |

**Deliberately NOT adding:**
- `actual_capacity` — recommend **reuse the projected `capacity`** as the sell-through
  denominator (real cap rarely differs from the booked cap). Add it later only if a
  tour reports a different settled cap. *(Open decision D3.)*
- comps/drops — **`drop_count` already exists** on `budget_income` (017); reuse it.
  `actual_tickets_sold` = net paid attendance.

Both new fields are ACTUAL-only → they live on the live `budget_income` layer, are
**NOT versioned** (no `budget_version_income` mirror), and **never lock**.

---

## 3. THE central decision — actual Overage DERIVED or settlement-authoritative?

### Recommendation: **(b) settlement-authoritative + tickets/gross as real context.**

Keep `actual_overage` (and the other money actuals) settlement-fed / hand-entered;
add `actual_tickets_sold` + `actual_gross` as real informational numbers + variance,
WITHOUT re-deriving the money.

**Why (b), grounded in the data-model truth — not assumed:**
- **Settlement authority already exists and already supplies actual_overage**
  (`settlement.reconciled_overage` → `budget_income.actual_overage`,
  `settlement/route.ts:244/259`). A settled overage is a negotiated, reconciled
  figure — it is frequently NOT what a clean `gross × deal%` formula would produce
  (adjustments, side-deals, disputed deductions). Re-deriving it would **fight the
  authority**: the rule is *settlement always wins*, so a derivation could only ever
  be a fallback, never the value — i.e. it would sit unused whenever a settlement
  exists (the common case).
- Option (a) would also require capturing the **real deal terms on the actual side**
  (a settled deal often differs from the projected deal), i.e. a second set of deal
  inputs — a large surface for marginal benefit.
- (b) is the minimal change that satisfies Adam's ask ("real attendance + real gross,
  most of the same info as Projected") and keeps **one source of truth** per number.

**What (b) still gives you (the audit Adam wants):** with `actual_gross` + the deal
terms already on the row, the grid can show a **reference "formula overage"**
(`projectIncome` run over `actual_gross`-implied inputs) **next to** the
settlement/actual overage as a read-only *expected* number — so you can SEE whether
the settled overage matches the math — **without** overwriting the authoritative
figure. This is reporting, not a second writer; income_gross is untouched.

**Option (a) for the record (rejected as the default):** feed `actual_gross` + real
deal terms into `incomeProjection.ts` → a computed actual overage, with a manual
override exactly like #28's projected-output override (the override seam built on
`feat/income-output-override` — `cellOverride` on `<Grid>` + per-output
`*_is_override` flags). Pro: consistent, every term auditable. Con: needs real deal
terms duplicated on the actual side, AND must yield to settlement (so it's a fallback
engine, not the value). Only revisit if Adam wants a derived actual where **no
settlement is captured**.

> If Adam picks (a): it must be gated so a settlement figure ALWAYS wins over the
> derivation, the projection engine math (`incomeProjection.ts`) stays untouched, and
> the change to income_gross is explicit + signed off.

---

## 4. Where the new fields are written (respecting the settlement seam)

To avoid a second source of truth, mirror the existing pattern exactly:

1. Add `tickets_sold` + `gross_box_office` (day-of + reconciled pairs, matching the
   existing settlement shape: `day_of_tickets_sold` / `reconciled_tickets_sold`, etc.)
   to the **`settlement`** table — the authority.
2. Cascade them in `settlement/route.ts:239-265` into
   `budget_income.actual_tickets_sold` / `actual_gross` (prefer reconciled over
   day-of), exactly like `actual_deductions`.
3. Allow **hand-entry on the Income Actual grid** for shows with no settlement record
   — same dual pattern as `actual_guarantee` today (settlement-fed when present, else
   manual via the income route's `nullableMerge`). The income route's actual-write
   path adds `actual_tickets_sold` / `actual_gross` to the accepted body + the
   `nullableMerge` upsert. *(Open decision D4: are tickets/gross editable in the grid,
   or settlement-only read-only like deductions? Recommend editable — many shows are
   settled informally without a settlement record.)*

---

## 5. Variance — how to surface projected-vs-actual

Three variances, all derivable from existing + new fields (no income_gross change):

| Variance | Projected | Actual |
|---|---|---|
| **Sell-through accuracy** | `est_sell_thru` (%) | `actual_tickets_sold / capacity` (%) |
| **Gross variance** | `capacity × est_sell_thru × face_value` | `actual_gross` |
| **Per-output** | `pre_tax_overage` / `merch_income` / `vip_income` / post-tax guarantee | `actual_overage` / `actual_merch` / `actual_vip` / `actual_guarantee` (already both present) |

**Rendering recommendation (in priority order):**
1. **New Actual-view columns** (primary): `Tickets`, `Gross`, and a computed
   **`Sell%`** (`actual_tickets_sold / capacity`) — so the Actual view visually
   mirrors Projected's `Cap / Sell% / Face` inputs. Per the projection-fix blank
   convention, show `—` until computable, never a stray 0.
2. **A compact variance strip** above the grid (or a third "Variance" segment beside
   Projected/Actual): sell-through accuracy (e.g. *"projected 90% → actual 86%"*),
   gross variance (£/%), and overall net variance. Cheapest, most legible.
3. **Summary P&L** (defer): the income breakdown could gain a sell-through / gross
   line, but this risks touching `computeBudgetPnl`. Recommend keeping the P&L money
   math unchanged in this phase and rendering variance in the grid/strip.
   *(Open decision D5.)*

`computeBudgetPnl` stays correct because tickets/gross never enter `grossAct`.

---

## 6. Blast radius

Every surface that reads income actuals / income_gross, and the impact:

- **BudgetIncomeGrid** (Actual view `:419-428`, onEdit map `:208-211`) — add the new
  columns to the Actual column set + the `patchFor` Actual branch + the `data`
  mapping. Projected view unchanged.
- **`/api/budget/income` route** — add `actual_tickets_sold` / `actual_gross` to the
  body type + the `nullableMerge` upsert (actual-write path; NOT in `PROPOSED_INCOME`
  → no lock guard, since actuals never lock).
- **`/api/budget/settlement` route** (`:239-265`) — add the two new settlement
  columns to the upsert payload + the cascade into `budget_income`.
- **`computeBudgetPnl`** (`:190-221`) — **no change**: the new fields are not summed
  into gross. (If/only-if option (a) is later chosen, this is where a derived overage
  would flow — explicit + signed off.)
- **Versioning (B1/B2)** — the new columns are ACTUAL-only → **not** added to
  `budget_version_income`, and the Actual view continues to pass `[]` to
  `versionLockedCols` (`BudgetIncomeGrid.tsx:434-437`) so they **never lock**. No
  change to approve / rollback / amend.
- **Per-show currency (216)** — `actual_gross` is a money field in the show's native
  currency; it converts via `toTourCurrency` like the other actuals. `actual_tickets_sold`
  is a count (currency-agnostic). No regression.
- **Projection fix (#28-adjacent)** — Projected outputs stay computed-locked + `—`-blank;
  untouched (Projected view gets no new columns).
- **`src/lib/budget/income.ts`** (`ServerIncome` / `IncomeRow` / `toIncomeRows`) +
  **`src/server/budget/versions.ts`** — extend `ServerIncome` + `IncomeRow` with the
  two new actual fields (versions.ts `ProposedIncome` is proposed-only → unchanged).
- **Settlement UI** (the settlement entry form, if present) — add tickets/gross inputs
  where day_of_*/reconciled_* are entered. *(Confirm at build time.)*

**No regression to:** the projection fix, B1/B2 versioning, per-show currency, the
projection engine math, or income_gross for existing rows.

---

## 7. Migration number

`main` highest = **219**. **220 is already taken** by `220_income_output_overrides.sql`
(on `feat/income-output-override`). **Receipts B2 also wants 220/221**
(`CC_RECEIPTS_B15_B2.md`). So this migration **most likely takes 221 — or 222 if
Receipts B2 lands 221 first.** Re-confirm across `main` + all active branches at
write time (the collision rule). Plan: additive `ADD COLUMN IF NOT EXISTS` on
`budget_income` (`actual_tickets_sold INTEGER`, `actual_gross NUMERIC`) + on
`settlement` (`day_of_tickets_sold` / `reconciled_tickets_sold` /
`day_of_gross` / `reconciled_gross`), nullable, idempotent, down-block. No
`budget_version_income` change (actual-only).

---

## 8. Open decisions (for Adam at Stage-B kickoff)

- **D1 — Model (a) vs (b)**: recommend **(b)** settlement-authoritative + tickets/gross
  as real context (§3).
- **D2 — Audit overage**: render a read-only "formula overage" reference next to the
  settled actual overage (recommended, reporting-only) — yes/no.
- **D3 — `actual_capacity`**: reuse projected `capacity` as the sell-through
  denominator (recommended) vs add a real settled cap column.
- **D4 — tickets/gross editable in the grid** for un-settled shows (recommended) vs
  settlement-fed read-only like deductions.
- **D5 — Variance rendering**: new Actual columns + a variance strip (recommended) vs
  also surfacing in the Summary P&L.
- **D6 — Field naming**: `actual_gross` vs `actual_box_office`; `actual_tickets_sold`
  vs `actual_attendance`. (Recommend `actual_tickets_sold` + `actual_gross`.)

## STOP

Stage-A map only. Await sign-off on **(b) over (a)** (§3), the **field set**
(`actual_tickets_sold` + `actual_gross`, reuse `capacity`/`drop_count`) (§2), and the
**variance rendering** (new Actual columns + strip) (§5) — plus the migration number
re-confirm — before building.
