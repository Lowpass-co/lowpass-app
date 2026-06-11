# BUDGET_INCOME_MAP — Stage A (map only, no code)

> Migrate the Budget **Income** tab (`BudgetIncomeTab.tsx`, a bespoke
> `BudgetCellInput` table) onto the canonical `<Grid>` — the same one Expenses
> uses (BUD-46). **The bridge:** the Summary P&L's `income_gross` consumes the
> exact income fields; the data shape, field names, and merge-safe upsert must
> stay byte-identical. UI-only change. Decisions in §5, then stop.
>
> **Status:** Stage A. Awaiting review + D1–D6 before Stage B.

---

## 0. TL;DR

- Income is **routing-anchored**: one row per routing **show** (all shows
  appear; `income` rows + `routing_only` zero-rows). No free add/delete.
- Fields (the bridge — must not rename): `pre_tax_guarantee, withholding_pct,
  pre_tax_overage, merch_income, vip_income` + `actual_guarantee, actual_overage,
  actual_merch, actual_vip`. Computed `post_tax = pre_tax × (1 − wh/100)`.
- **Endpoint unchanged:** GET/POST `/api/budget/income` (merge-safe upsert on
  `routing_id`). The migration keeps using it verbatim.
- **P&L reads the DB rows, not the tab** → keeping the endpoint + fields makes
  the migration transparent to `income_gross`.
- `BudgetCellInput` is **shared** (also `BudgetSpreadsheetView`) → **do NOT
  delete it**.
- Recommend **option (a): plain `<Grid>`, rows = shows, a Show column, no
  add/delete** — matches Expenses, simplest, what Adam asked for.

---

## 1. `BudgetIncomeTab.tsx` (483 lines) — current surface

Props `{ tourId, tourCurrency }`. State: `rows: IncomeRow[] | null`,
`view: 'projected'|'actual'`.
- **Load** (`load`, useMemo): `GET /api/budget/income?tour_id=` → `{ income,
  routing_only }`. Maps `income` rows (with nested `routing.date/venue_name/city/
  day_type`) + `routing_only` shows (all fields 0) → `IncomeRow[]`, sorted by
  date. So **every show renders**, even with no income row yet.
- **`IncomeRow`** = `{ routing_id, date, venue_name, city, day_type,
  pre_tax_guarantee, withholding_pct, pre_tax_overage, merch_income, vip_income,
  actual_guarantee, actual_overage, actual_merch, actual_vip }`.
- **Optimistic commit** (`commit(routingId, patch)`): apply locally → `POST
  /api/budget/income { routing_id, ...patch }` (single field) → on failure toast
  + `load()` resync. NO reload on success. (Same pattern as Expenses.)
- **Computed** `postTax(preTax, wh) = preTax * (1 - wh/100)` — Post-tax + Total
  are display-only (not persisted).
- **Projected view** columns: Show · Guarantee(`pre_tax_guarantee`) · WH %
  (`withholding_pct`, a 0–100 number input) · Post-tax(derived) ·
  Overage(`pre_tax_overage`) · Merch · VIP · Total(derived).
- **Actual view** columns: Show · Guarantee(`actual_guarantee`) ·
  Overage(`actual_overage`) · Merch(`actual_merch`) · VIP(`actual_vip`) ·
  Total(derived). (No WH%/Post-tax — actuals are already net.)
- **Toggle**: a segmented `projected | actual` control above the table.
- Money cells = `BudgetCellInput`; WH% = a plain `<input type=number>`.
- Totals row sums per the active view (post-tax for projected).

## 2. The P&L consumer (must preserve)

`src/lib/budget/computeBudgetPnl.ts` `computeBudgetPnl(input)` (L122):
- **Projected income** (L146): per income row `num(pre_tax_guarantee) * (1 -
  num(withholding_pct)/100)` (+ overage post-tax + merch + vip).
- **Actual income** (L163): `actual_guarantee + actual_overage + actual_merch +
  actual_vip`.
- `income_gross` (L108/207) is the basis option for insurance / accountancy
  overheads (Settings).
- Same fields also read by `src/lib/budget-utils.ts` (L185, 266),
  `src/lib/commission-context.ts` (L42–142), `src/components/budget/DayViewTab.tsx`
  (L157–159). All read the **`budget_income` DB rows** (via the API / server),
  **not** `BudgetIncomeTab`.
- ⇒ **The migration must preserve: the field names, the `post_tax = pre_tax ×
  (1−wh/100)` rule, and the `/api/budget/income` upsert.** It changes only how
  the cells are rendered. `income_gross` is then identical for identical inputs.
- Note: a legacy `post_tax_guarantee` column is referenced as a fallback
  (`pre_tax_guarantee ?? post_tax_guarantee`) — the tab never writes it; keep not
  writing it (post-tax stays derived).

## 3. The endpoint (unchanged)

`src/app/api/budget/income/route.ts`:
- **GET** `?tour_id=` → `{ income: ServerIncome[], routing_only: RoutingOnly[] }`.
- **POST** body `{ routing_id, <any subset of the 9 fields> }` → **merge-safe
  upsert** (`numMerge`/`nullableMerge` keep unprovided fields), `.upsert(payload,
  { onConflict: 'routing_id' })`. Per-cell single-field writes are the contract.

## 4. How Expenses mounts `<Grid>` (reuse these primitives)

`src/components/budget/BudgetGridView.tsx` (+ `src/lib/grid/budgetAdapter.ts`):
- `<Grid initialColumns initialData fx slideStatuses slideLineVariant onEdit
  onAddLine onAddSection onRenameSection onDeleteRow onReorderRow
  onReorderSection lineApi />`.
- **Columns** (`Column[]`): `{ id, label, type, w, min, resize, options?,
  optColors?, hidden? }`; types incl. `idx · text · money · number · status ·
  variance · calc · receipts`. Money cells render via the injected `fx`; `calc`
  columns render `col.calc(row)` (read-only derived); `variance` = est-vs-act.
- **fx** (`GridFx`): `displayCurrency` from `?display=`, `toDisplay`, `symbol`,
  `formatDisplay` (from `src/lib/budget/fx.ts`). Income reuses this verbatim.
- **`onEdit(rowUid, field, value)`** → `gridEditToPatch(field, value)` → PATCH.
  Income's analogue: `rowUid = routing_id`, map grid column id → income field →
  `POST /api/budget/income`.
- **Sections**: Expenses groups by `budget_sections`; the Grid renders a section
  header + a **"+ Add line"** button for `sec.kind==='normal'`. Income has **no
  sections / no add** → see D6.
- **Re-key**: `key={`${tourId}:${lines.length}:${sections.length}`}` re-seeds on
  structural change; cell edits keep state.

## 5. Decision for Adam — render shape (D1) + supporting calls

**D1 — Render shape.**
- **(a) Plain `<Grid>`, rows = shows** *(RECOMMEND)*. One implicit section (no
  section chrome), a leading **Show** column (date · venue/city, read-only), then
  the income columns. No add/delete/reorder (omit those callbacks). Matches
  Expenses visually; simplest; exactly Adam's ask.
- **(b) Routing-anchored rail** (days-on-left `<RoutingRail>` + a right panel).
  Consistent with Rooming/Payroll, but heavier, and not what Adam asked for. Map
  noted; **not recommended** for this migration.

**D2 — Projected/Actual toggle.** Keep the segmented control above the Grid;
switching **swaps the Grid's column set** (re-key the Grid by view). Projected =
Guarantee/WH%/Post-tax/Overage/Merch/VIP/Total; Actual = Guarantee/Overage/Merch/
VIP/Total. Confirm. *(The grid-demo already proved an Expenses/Income column
swap, so the pattern exists.)*

**D3 — Column types.** Show = `text` (read-only); money fields = `money`; **WH%**
= `number` (0–100, no currency); **Post-tax + Total** = `calc` (read-only
derived: `postTax(...)`, row total). Confirm these map cleanly (they do — all
exist in the Grid column model).

**D4 — Persistence.** `onEdit(routing_id, columnId, value)` → map columnId →
income field → `POST /api/budget/income` (single field, merge-safe), optimistic,
no reload — **identical to today's `commit`**, just sourced from the Grid. No new
endpoint. Confirm.

**D5 — `BudgetCellInput`.** It's **shared** with `BudgetSpreadsheetView` (Classic
Expenses) → **leave it** (the prompt's "delete only if nothing else uses it" →
it's used → keep). Confirm.

**D6 — Suppress add-line for fixed rows.** The Grid renders a **"+ Add line"**
button on every `sec.kind==='normal'` section (even without an `onAddLine`
callback — it falls back to a local add). Income must have **no add row**. Stage
B needs a minimal Grid prop (e.g. `allowAddRows?: boolean`, default **true** so
Expenses/demo are unchanged) that Income passes `false` — OR an income-specific
section kind that hides the add button. Confirm the approach so I don't change
the Expenses/demo default. *(Recommend the `allowAddRows` prop — one guard,
zero effect on existing callers.)*

---

## 6. Hard-rule compliance (Stage A)

- ✅ Both sides mapped: the income tab (render/state/commit/endpoint/post-tax/
  toggle), the P&L consumer (`computeBudgetPnl` L146/163 + the 3 other readers),
  the Expenses `<Grid>` primitives — all cited with files/lines.
- ✅ Confirmed the bridge (fields + endpoint + post-tax rule) the migration must
  preserve; confirmed `BudgetCellInput` is shared (don't delete).
- ✅ Flagged the one Grid gap (add-line on normal sections) the build must guard.
- ⛔ **No code written.** Stopping for D1–D6 review.

### Stage B smoke IDs (placeholders — budget.md)
- **BUD-50** Income on `<Grid>`: rows = shows, Show column, projected columns
  (Guarantee · WH% · Post-tax · Overage · Merch · VIP · Total); no add/delete.
- **BUD-51** Edit Guarantee/WH%/Overage/Merch/VIP → **Post-tax + Total recompute
  live**, persists (POST `/api/budget/income`), no reload.
- **BUD-52** Projected↔Actual toggle swaps the column set; actuals edit + persist.
- **BUD-53** **P&L bridge**: after edits, Summary `income_gross` is **identical**
  to the same inputs pre-migration (the field/endpoint contract held).
- **BUD-54** Currency follows the DISPLAY selector (same `fx` as Expenses).
