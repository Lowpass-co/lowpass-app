# INCOME_REDESIGN_MAP — Stage A (map only; no schema, no code)

> Income redesign: Settlement→actuals, projected merch/VIP formula, per-show
> currency, P&L/Summary refresh. Touches `budget_income` +
> `budget_version_income` (B1). **Status:** Stage A. Awaiting Adam + Claude review
> before any schema/UI. Decisions (D-SETTLEMENT / D-CAPACITY / D-FORMULA /
> D-CURRENCY / D-PNL) + recommendations below.

## 1. Current income model (confirmed)
- **`budget_income`** (`017:`, `UNIQUE(routing_id)`): **proposed** =
  `pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income`
  (+ derived `post_tax_*`); **actual** = `actual_guarantee, actual_overage,
  actual_merch, actual_vip`; `drop_count, notes`. **No `currency` column.**
- **`BudgetIncomeGrid`** — projected/actual view toggle; proposed read from the
  active version's `budget_version_income` (B1 overlay); per-row currency uses
  the tour display currency. B2 made projected cells read-only when locked.
- **`computeBudgetPnl.ts`** — `IncomeInput` (`:85-97`) carries pre/post/merch/vip
  + actual_*. Gross income = post-tax guarantee + post-tax overage + merch + VIP
  (`:10`). Already calls `convertToCurrency` (`:33`) but income is single-currency
  today. Output `currency: string` (one total currency).
- **`BudgetSummaryTab.tsx`** — bespoke `<table className="lp-dense">` (`:299`,
  `:923`) + a chart; **not** the canonical `<Grid>`. Reads `computeBudgetPnl`.
- **Who writes `actual_*` today:** the **settlement route** (on reconcile — see
  §2) and the income route (manual edit). `loadTourIncome` (`income.ts:126`)
  reads them from `budget_income`.

## 2. D-SETTLEMENT — **already ~70% built; refine, don't rebuild**
`settlement` (`017:`, `UNIQUE(routing_id)`) holds per-show `day_of_*` +
`reconciled_*` (guarantee/overage/merch/deductions/net). The settlement **POST
already syncs to income** (`settlement/route.ts:239-261`):
```
actual_guarantee ← reconciled_guarantee ?? day_of_guarantee
actual_overage   ← reconciled_overage   ?? day_of_overage
actual_merch     ← reconciled_merch     ?? day_of_merch
→ UPDATE budget_income WHERE routing_id (only if an income row already exists)
```
- **Join key = `routing_id`** (both tables keyed by it). Clean + stable. ✓
- **Fires** on every settlement POST (`reconciled` preferred, `day_of` fallback). ✓
- **Gaps to fix in the redesign:**
  - **No `actual_vip`** — settlement has no VIP field → VIP actual stays manual.
  - **Only updates EXISTING income rows** — a settled show with no income row
    loses its actuals. → **upsert** (create the income row if absent).
  - **Deductions/net** — settlement tracks them; income has no deductions/net
    actual field. Decide: add, or leave net as a P&L-side computation.
- **Recommend:** keep the existing sync; (a) make it an **upsert**; (b) **VIP
  stays manual** (income actual_vip editable; settlement isn't a VIP source);
  (c) leave deductions out of income (net is computed in the P&L). Actuals are
  **unversioned** (one live layer) → no `budget_version_income` coupling. **Adam:
  confirm VIP-manual + deductions-out.**

## 3. D-FORMULA + D-CAPACITY — projected merch/VIP = `$/head × capacity × sellout%`
- **Inputs.** `$/head` (merch + VIP rates), `sellout %` → **per-tour default +
  per-show override** (recommended; most shows share a default). `capacity` →
  **per-show** (varies every night).
- **D-CAPACITY (the hardest dependency).** `canonical_venues.capacity` exists
  (`214:39`) but is **NULL — "no neutral source yet" (Adam 2026-06-25)**; routing
  has `routing.canonical_venue_id` (`214:69`). So the *path* exists
  (routing → canonical_venue → capacity) but it's **unpopulated**. Options:
  - **(a) manual per-show capacity** on the income row (recommended — works now,
    no external source);
  - (b) auto-read `canonical_venues.capacity` (blocked until someone populates it);
  - (c) hybrid: default to the canonical capacity when present, else manual.
  - **Recommend (c)**: a manual `capacity` on income that **pre-fills from
    `canonical_venues.capacity` when available** — so it works today and improves
    when the venue source lands. **Flag: with capacity NULL everywhere, the
    formula is manual-entry-only until venue capacities are populated.**
- **The formula** computes a *projected* `merch_income`/`vip_income` (the
  PROPOSED columns) — it pre-fills them; the user can still override. So the
  formula inputs (`$/head`, `sellout%`, `capacity`) are **proposed structure →
  versioned** (§6).
- **Recommend:** per-tour defaults in budget settings + per-show overrides +
  per-show capacity (pre-filled from canonical when present), all on the proposed
  income; the grid shows a computed merch/VIP that's editable.

## 4. D-CURRENCY (INC-05) — per-show currency
- **Today:** no per-show currency (no `routing.currency`, no `budget_income.
  currency`). All income is tour currency.
- **Add** `currency` to **`budget_income`** (per show; it's the income concept,
  not routing's). The P&L must total in **one** (tour) currency.
- **FX conversion.** computeBudgetPnl already uses `convertToCurrency`. Options
  for the per-show → tour rate: (a) **manual FX rate per show** (entered on the
  income row); (b) a **tour-level rate map** (one rate per currency); (c) live
  rates (**out of scope**). **Recommend (b): a small per-tour FX-rate table**
  (e.g. `{EUR: 1.17}`) the P&L applies to each show's native gross → fewer inputs
  than per-show, deterministic, auditable; per-show override as a later add.
  `currency` is **proposed structure → versioned** (§6).

## 5. D-PNL (INC-04) — Summary/P&L refresh
- **Today:** `BudgetSummaryTab` is a bespoke `<table>` + chart, not the canonical
  Grid. The P&L is a **read-only report**, so the editable `<Grid>` isn't a
  natural fit.
- **Recommend: a visual refresh, NOT a canonical-grid port** — token-clean P&L
  cards (gross / expenses / net) + a tidied variance table (proposed vs actual vs
  Δ, vs the **approved** version) + the existing chart, keeping `computeBudgetPnl`
  as the single source. (A read-only Grid for the section breakdown is a possible
  hybrid, but lower value.) **This is a design-taste call — Adam to steer.**

## 6. Versioning impact
- **Proposed** income gains columns: `currency`, `capacity`, `$/head`,
  `sellout%` (whichever drive the proposed projection). Each must be **mirrored
  into `budget_version_income`** (snapshot) + the **lock guard** extended: add
  them to `PROPOSED_INCOME` in `income/route.ts` so a write to them on an approved
  version → 423; the page overlay (`page.tsx` getProposedIncomeMap) returns them;
  `BudgetIncomeGrid` renders them read-only when locked.
- **Actuals** (settlement-fed) stay **unversioned** — no version coupling.
- So: `budget_version_income` migrates **alongside** `budget_income` (the tax
  flagged in B1's header comment) — every new proposed column appears in both.

## 7. Blast radius + migration
| Surface | Change |
|---|---|
| `budget_income` | + `currency`, `capacity`, `$/head`/`sellout%` (proposed); maybe tour-level FX-rate + defaults |
| `budget_version_income` | mirror the new PROPOSED columns (versioning tax) |
| `income/route.ts` | extend `PROPOSED_INCOME` lock set; persist new columns |
| `settlement/route.ts` | upsert income (create if absent); VIP/deductions decision |
| `BudgetIncomeGrid` | new columns + the projected formula + per-show currency + lock |
| `computeBudgetPnl` | per-show FX conversion to tour currency; formula-aware proposed |
| `BudgetSummaryTab` | P&L visual refresh (D-PNL) |
| `income.ts` (loadTourIncome / version overlay) | map new columns |
| `page.tsx` | overlay new proposed columns from version_income |
- **Migration `215`** (214 = canonical-venues on main; 213 = RAG; 215 free — verify
  across branches at write time).

## Decisions to sign off (then Stage B, phased)
- **D-SETTLEMENT:** refine the existing sync — upsert + VIP-manual + deductions-out. *(Rec.)*
- **D-CAPACITY:** manual per-show capacity, pre-filled from `canonical_venues.capacity`
  when present (NULL today → manual-only for now). *(Rec.)* **Hardest dependency.**
- **D-FORMULA:** per-tour defaults ($/head, sellout%) + per-show overrides + per-show capacity. *(Rec.)*
- **D-CURRENCY:** `budget_income.currency` + a per-tour FX-rate map; P&L converts to tour currency. *(Rec.)*
- **D-PNL:** visual refresh of `BudgetSummaryTab` (not a Grid port). *(Rec., design-taste — Adam.)*
- **Migration 215.** **Phasing:** suggest B1 settlement-upsert+VIP (smallest, no schema),
  B2 per-show currency, B3 formula+capacity, B4 P&L refresh — each carrying its
  `budget_version_income` tax.

⛔ **No schema, no code.** Stopping for review.
