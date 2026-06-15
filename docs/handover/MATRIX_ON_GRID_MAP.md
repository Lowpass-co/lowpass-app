# MATRIX_ON_GRID_MAP — Stage A (map only, no code)

> Rebuild **RoomingMatrix** + **PayrollDaysMatrix** AS canonical `<Grid>`
> instances (people rows × day columns), which delivers people-on-left + native
> drag-select + the design cues for free. The catch: `<Grid>` needs **"wide
> mode"** (frozen first column, column grouping, per-column footer) and that
> MUST be **additive/opt-in** so the verified budget grid is byte-for-byte
> unchanged. **This doc proves wide mode can be additive**, maps each matrix as
> `<Grid>` props, and surfaces the two hard bits. Decisions in §6, then stop.
>
> **Status:** Stage A. Awaiting review + D1–D6 before Stage B.

---

## 0. Headline: wide mode CAN be additive ✅ (the gating decision)

The risky question — "can wide mode be added without reworking budget's layout?"
— is **YES**, with strong evidence:

- **Horizontal scroll already exists and is already inactive for budget.**
  `grid.css`: `.lp-grid .gridwrap { overflow-x: auto }` (L69) +
  `.gridinner { width:100%; min-width: max-content }` (L71–76). The grid scrolls
  **only when fixed columns overflow**. Budget's column set includes the `item`
  column rendered `minmax(w, 1fr)` (`template()` `gridModel.ts:97–105`), which
  absorbs slack → budget **never overflows → never scrolls**. The matrices have
  **no `item` column** → all columns are fixed `${w}px` → they overflow → the
  **existing** scroll kicks in. **No change to budget's path.**
- **Columns are a CSS grid driven by `--cols`** (`.gridhead`, `.sec-head`,
  `.row` all `grid-template-columns: var(--cols)`). Wide-mode additions hang off
  a **gate** (a `wide`/`data-wide` flag + new optional props) that budget never
  sets — so `template()`, the header, rows, sec-head, and toolbar render
  identically for budget.
- **Drag-select, the Sel range model, ring, insertion line, tokens, density** —
  all already in `<Grid>`, shared by every consumer for free. (This is the
  "lost drag-to-select" Adam wants back — it returns automatically.)

**What's genuinely missing (the additive work):**
1. **Frozen first column(s)** — no sticky-left today. Add via CSS gated on
   `.lp-grid[data-wide]` + a `frozenCols` count. Budget (no `data-wide`) =
   unchanged.
2. **Cell-FILL tint** — `optColors` today colours the dropdown **pill**
   (text/border, `.ddpill`, Grid.tsx ~1396), NOT the cell fill. Matrix wants the
   fill. Add a wide-mode (or column-flagged) cell-background tint. Additive.
3. **Per-column footer** (rooming "rooms per night") — `<Grid>` only has
   row-direction totals (section `sh-sub`, toolbar tour total). A column footer
   is new — an optional footer row using the same `--cols`. Additive.
4. **Column grouping (payroll week bands)** — `<Grid>` groups ROWS (GroupBy
   section|status), never columns. A spanning week-header is new — see D1
   (recommend the light option).

⇒ **Proceed.** None of (1)–(4) touches budget's render; all are opt-in. (If any
had required reworking `template()`/the header for the default path, the rule
says stop — but they don't.)

---

## 1. `<Grid>` internals (how columns lay out today)

- `colsTemplate = template(cols(), widths())` (Grid.tsx:942) → set as the
  `--cols` CSS var on `.lp-grid` (1547). `template()` maps each visible column to
  `${w}px`, except `id==='item'` → `minmax(${w}px, 1fr)`.
- Layout containers (Grid.tsx 1614–1649): `.gridwrap` (the h-scroll + panel
  chrome) → `.gridinner` (`min-width:max-content`) → `.gridhead` (sticky-top
  header, `grid-template-columns:var(--cols)`) + `#gr-sections` (the rows /
  section cards, each `.row`/`.sec-head` also `var(--cols)`).
- **No element has `position:sticky; left` (no frozen column)** — only the
  header is sticky-**top**. Confirmed by grep.
- **Cell render** (`renderCell`): `idx | text | money | number | check |
  dropdown | status | variance | calc | …`. **`dropdown`** (Grid.tsx ~1394):
  renders `<span class="ddpill" style={color/borderColor = optColors[value]}>` —
  pill colour, not fill. Edit opens a menu (`openDropMenu`) → `row[id]=v` +
  `onEdit(uid, id, v)`.
- **Selection**: `Sel { ar, ac, fr, fc }` + `inSel()` (gridModel.ts) — a true
  rectangular range over rows×cols, with pointer drag-select. Works for any
  column count.
- **Totals**: per-section `sh-sub` (`est/act` summed down the section's rows,
  Grid.tsx ~1504) + the toolbar tour total (`cEst/cAct`, ~1596). **Both sum DOWN
  rows.** No per-column (down a single column) footer.

## 2. Each matrix as `<Grid>` props

Shared binding (both): `row._uid = person id`; one **dropdown Column per day**,
`id = dayId`, `options = ROOM_OPTIONS | DAY_OPTIONS`, `optColors = the tints`;
`row[dayId] = cellOf/statusOf(person, dayId)`; `onEdit(personId, dayId, value)
→ saveCell / saveDayStatus`. **The id-keyed hooks (`useRoomingGrid` /
`usePayrollGrid`) are unchanged** — only the view layer moves to `<Grid>`.

### Rooming (`RoomingMatrix.tsx`)
- Columns: `[ person (frozen, text ro) ] + [ one dropdown per night
  (ROOM_OPTIONS, optColors = SGL/DBL tints) ]`.
- Rows: roster people **+ off-roster people as rows** (greyed, with a ✕ to
  remove — D5; today they're greyed *columns*, now rows).
- `cellOf(person, nightId) → row[nightId]`; edit → `saveCell(person, nightId,
  code)` (optimistic, OPS-04). Shared-room letter counting in `roomNightsOn` is
  unchanged.
- Footer: **rooms-per-night** = `roomNightsOn(nightId)` per **day column** → a
  per-column footer (D2). Assumed-rate input + est-total stay above the grid.

### Payroll (`PayrollDaysMatrix.tsx`)
- Columns: `[ person (frozen) ] + [ one dropdown per routing date (DAY_OPTIONS
  show/off_travel/no_tour, optColors = day tints) ]`, **all routing dates**.
- Rows: personnel. `statusOf(person, date) → row[dateId]`; edit →
  `saveDayStatus(person, date, status)`.
- **Week bands** across the day columns — D1.

## 3. The two hard bits (options + recommendation)

### D1 — Payroll week bands
- **(a) Real column-band header**: a second sticky header row above the day
  columns, each band spanning its week's columns (CSS `grid-column: span N` over
  `--cols`). Truest to the design; **moderate new work** (a second header row +
  span maths, kept in sync with column widths/scroll).
- **(b) Week label in each day-header** *(RECOMMEND)*: each day column header
  shows `WC 18 · Mon 18` (or a subtle left-border at week starts). **Light** —
  no new grid structure, no span maths. Reads clearly, scrolls correctly.
- *Recommend (b)* unless Adam wants the literal banner; (a) can be a follow-up.

### D2 — Per-column footer (rooming rooms-per-night)
- `<Grid>` has no column footer. Add an **optional footer row** rendered with the
  same `--cols` template (one cell per column), driven by a new prop e.g.
  `columnFooter?: (colId) => ReactNode` (+ a frozen first footer cell label).
  Additive — only rendered when the prop is passed (budget doesn't). *Recommend
  this* over a separate detached footer element (keeps column alignment under
  h-scroll automatically).

## 4. RailNightCell — safe to drop from the matrices

Grep: `RailNightCell` used in exactly **`RoomingMatrix.tsx`,
`PayrollDaysMatrix.tsx`, `RoutingRail.tsx`**. The rebuild flips days to **column
headers**, so the matrices stop using `RailNightCell` (the day-header renders a
compact date·city·day-type inline — D6). `RoutingRail.tsx` (advance / routing /
Cards / Nights) is **untouched**. ✓

## 5. Behaviours preserved (unchanged — view layer only)

`useRoomingGrid` / `usePayrollGrid` (fetch, optimistic `saveCell`/
`saveDayStatus`, off-roster, `roomNightsOn`, day-type/room-code tint helpers,
the assumed-rate/est-total) all stay. ⇒ the **budget Accommodation + Salary
reconcile feeds, shared-room letter logic, off-roster, the £0/non-£0 reconcile
behaviour are all untouched** — they're driven by the writes, not the view.

---

## 6. Decisions for Adam (D1–D6)

- **D1 — Week bands:** (b) week label in each day-header *(recommend)* vs (a) a
  real spanning column-band header (more work, can follow up).
- **D2 — Column footer:** add an additive `columnFooter?: (colId)=>ReactNode`
  to `<Grid>` (same `--cols`, only rendered when passed) for rooming's
  rooms-per-night. Confirm.
- **D3 — Cell-fill tint:** in wide mode, fill the day-cell background with the
  `optColors` tint (today it colours the pill text/border). Additive (gated).
  Confirm.
- **D4 — Frozen columns prop:** add `wide?: boolean` (sets `data-wide`) +
  `frozenCols?: number` (default 0). Sticky-left CSS gated on
  `.lp-grid[data-wide] .hc:nth-child(-n+K)` / `.c:nth-child(-n+K)`. Budget sets
  neither → unchanged. Confirm the prop shape (one `wide` flag + `frozenCols`).
- **D5 — Off-roster as rows:** rooming off-roster people render as **rows**
  (greyed, ✕ to remove) now that people are rows. Confirm (vs the old greyed
  columns).
- **D6 — Day-header content:** each day column header shows a compact
  date·city·day-type pill (NOT `RailNightCell`, which is vertical). Confirm a
  small compact day-header is fine.

**Recommendation:** proceed — wide mode is cleanly additive (§0). Build the
`<Grid>` additions behind `wide`/`frozenCols`/`columnFooter` (+ the cell-fill
tint gated on `data-wide`), rebuild both matrices on `<Grid>`, keep the hooks.
Budget never opts in → provably unchanged.

---

## 7. Hard-rule compliance (Stage A)

- ✅ Proved wide mode is additive with cited CSS/code (h-scroll already exists +
  inactive for budget; everything else gated on an opt-in flag/props).
- ✅ Mapped both matrices as `<Grid>` props bound to the unchanged id-keyed hooks;
  confirmed the budget feeds + shared-room logic live in the writes, not the view.
- ✅ Confirmed `RailNightCell`'s only other consumer is `RoutingRail` → dropping
  it from the matrices doesn't touch advance/routing/Cards/Nights.
- ⛔ **No code written.** Stopping for D1–D6 review.

### Budget files to confirm UNCHANGED in Stage B (the invariant)
`src/components/budget/BudgetGridView.tsx` (Expenses) · `BudgetIncomeGrid.tsx`
(Income, also a `<Grid>` consumer) · `src/app/(app)/grid-demo/*` ·
`src/components/grid/gridModel.ts` (`template()` untouched) — none set
`wide`/`frozenCols`/`columnFooter`, so their render is byte-for-byte identical.

### Stage B smoke IDs (placeholders)
`docs/smoke-tests/rooming.md` / `operations.md`:
- **MTX-01** Both matrices are `<Grid>` instances: people = rows, days = columns.
- **MTX-02** Frozen person column + horizontal scroll (people stay visible).
- **MTX-03** Native drag-select range + ring across day cells.
- **MTX-04** Day-cell dropdown tints fill the cell (room code / day type).
- **MTX-05** Edit persists via the hooks (saveCell/saveDayStatus), optimistic,
  no reload; budget Accommodation/Salary feeds unchanged.
- **MTX-06** Rooming rooms-per-night column footer; shared-room letter counting.
- **MTX-07** Payroll week treatment (D1) + all routing dates incl. no-tour.
- **MTX-08** Off-roster people as rows + ✕ remove.
- **MTX-09** **Budget grid (Expenses + Income) visually/behaviourally unchanged.**
