# CC — Income grid polish round 2 (#28). Phase A = build (no schema). Phase B = Stage-A map (schema). Branch off `main`.

Projection now computes reliably and the outputs are read-only. This round is the data-entry polish Adam
wants before he rebuilds the Charlotte Sands budget in the tool. **Phase A is three shippable UI
improvements (no schema) — build them. Phase B (manual override of a computed output) touches the data
model — MAP ONLY, no code, gated for review.**

## Phase A — UI polish (build, no schema)

### A1 — Deal-type type-to-select (and other dropdowns)
Today the `deal` dropdown (`BudgetIncomeGrid.tsx:316`, `type: 'dropdown'`) only opens on click / Tab-auto-
open. Add **type-to-select**: with a dropdown cell selected, typing a letter jumps to / selects the first
option whose label starts with it (V→VS, P→PLUS, F→FLAT; currency D→… etc.). This is a **grid-core**
change in `Grid.tsx` (the dropdown key handler near the existing menu logic ~`:934` / the `startEdit`
path). **Opt-in by behaviour, not a flag** — it must not break click-open, the Tab-auto-open (Grid-v2 #4),
or Esc/commit. Applies to every dropdown cell (income `deal`/`currency`, and any other grid's dropdowns)
— verify Payroll rate-type / status dropdowns still behave.

### A2 — Number entry boxes
Numeric/money cells (`Grid.tsx:2323` `type === 'number'`, + money) get a cleaner number-entry affordance
(the "number boxes" Adam asked for) — right-aligned, `inputMode="decimal"`, select-all-on-focus so typing
replaces, no native spinner arrows (they break the grid's keyboard model). **Pure presentation** — do NOT
change commit/parse behaviour, the fill-handle, or copy-paste. Confirm money formatting (currency symbol,
the `—` blank for null) is unchanged from the projection fix.

### A3 — Per-tour column hide/show
The income grid is dense (~16 cols). Wire the existing **"Columns"** toolbar button to a hide/show manager:
a checklist of the grid's columns; unchecking hides a column; the non-droppable ref columns
(date/type/venue/city) and the `idx` are always shown. **Persist per-tour in `localStorage`** (key by
tourId + grid id — no schema, mirrors how other per-user grid prefs are kept). Hidden columns are excluded
from render + Tab order but NOT from data/compute. Default = all shown (no behaviour change until used).
Scope to the **income** grid first (don't retrofit Payroll/Rooming in this pass).

## Phase B — Manual override of a computed output (MAP ONLY → `INCOME_OVERRIDE_MAP.md`)
The projection fix made Overage/Merch/VIP **read-only + always-recomputed** (`income/route.ts`
`recomputeOverage = has(OVERAGE_INPUTS)`). PLUS / one-off deals need a way to **deliberately hand-enter** an
output. This needs override-tracking so the route knows NOT to recompute that cell — a **data-model change**,
so map it, don't build it:
- Map where the recompute decision lives (`income/route.ts:216`) and how a per-output override would gate it
  (e.g. `overage_is_override boolean` / a nullable `*_override` value column on `budget_income`, vs a single
  `manual_outputs` jsonb). Recommend the minimal model.
- The UX: right-click a read-only output → **"Override formula"** → warning ("this replaces the computed
  value") → cell becomes editable + flagged (a distinct marker, not the ƒ); **deleting an override → "Revert
  to formula?"** → clears the flag, engine recomputes. Map the grid seam for this (the `PROJECTED_OUTPUT_COLS`
  read-only set in `BudgetIncomeGrid.tsx:53`).
- Blast radius: must not reintroduce the **persistent-0 bug** (an override is an explicit user action, never a
  stray 0); must respect versioning (overrides live on the draft, lock with it); `computeBudgetPnl` reads the
  final value either way. Migration number: next free at write time (220/221 contested w/ Receipts B2 +
  Actuals — re-confirm).
- **Then stop.** Surface the override-storage recommendation for Adam + Claude before any build.

## Hard rules
- **Branch off `main`. Phase A commits + PUSH; Phase B is the map doc committed + pushed. Confirm
  `git log origin/<branch>` before reporting.**
- Don't regress the projection fix (outputs computed-locked, `—` blank, recompute-by-default), B1/B2
  versioning, the income phases, or other grids (A1/A2 are grid-core — verify Payroll/Rooming/Channel-List/
  Expenses dropdowns + number cells are unchanged).
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0. New smoke IDs in `docs/smoke-tests/budget.md`
  (ING-R2-01 type-to-select; ING-R2-02 number boxes; ING-R2-03 column hide/show persists per tour).
- **Verify before claiming** — name files/lines; push the hash. I Chrome-verify: type V in a deal cell → VS
  selects; hide a column → it's gone + persists on reload; Payroll dropdowns/number cells unaffected.
