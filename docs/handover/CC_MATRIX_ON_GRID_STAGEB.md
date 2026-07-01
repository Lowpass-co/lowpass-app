# CC — Matrices on `<Grid>` Stage B: GO (D1–D6 answered)

`MATRIX_ON_GRID_MAP.md` reviewed. The gating question is answered with cited
evidence — **wide mode is additive**: `.gridwrap { overflow-x:auto }` already exists
and is inert for budget (its `item` `minmax(w,1fr)` column absorbs slack → never
overflows), while the matrices' all-fixed-width columns ride the existing scroll.
`template()`/header/budget path untouched. **Commit the map.** Build Stage B.

## Decisions
- **D1 — Payroll week bands: (b), refined. NOT per-column.** Do the light option, but
  don't stamp a week label on *every* day-header (that's the repetitive ugliness Adam
  is trying to get away from). Instead: a **week-boundary divider** between weeks (at
  each Monday column edge) + the **week label on the first day-column of each week
  only**. No column-group machinery. The full spanning column-band (a) is a nicer
  follow-up — file it, don't build it now.
- **D2 — Per-column footer: YES.** Additive `columnFooter?: (colId) => ReactNode`
  rendered on the same `--cols` grid (only when passed) — alignment-under-scroll comes
  free. Rooming "rooms per night" uses it. Don't build a detached footer.
- **D3 — Cell-fill tint in wide mode: YES, additive.** The matrices fill the whole
  cell with the room/day tint (not just the pill), so wide mode needs cell-fill.
  Gated on the wide flag so budget's pill-tint is unchanged.
- **D4 — Prop shape: YES.** `wide?: boolean` (sets `data-wide`) + `frozenCols?: number`;
  sticky-left CSS gated on `[data-wide]`. Matrices pass `wide frozenCols={1}` (freeze
  the person column).
- **D5 — Off-roster people as rows (greyed, ✕): YES.** Logical now that people are
  rows. Keep the remove affordance; roommates keep their room when one is removed.
- **D6 — Day-column header = compact date·city·day-type pill: YES.** Not
  `RailNightCell` (vertical). Grep-confirmed `RailNightCell`'s only other consumer is
  `RoutingRail` → advance / routing / Cards / Nights untouched. Good.

## Hard rules
- **Budget invariant — prove it.** The files you named (`BudgetGridView.tsx`,
  `BudgetIncomeGrid.tsx`, `grid-demo/*`, `gridModel.ts` `template()`) must be
  byte-for-byte behaviourally unchanged — none set the new props. Name them in the
  Stage-B diff as confirmed-unchanged.
- Don't touch `RoutingRail.tsx` or its consumers. Writes stay on the existing id-keyed
  `useRoomingGrid` / `usePayrollGrid` hooks (orientation-independent) → budget
  Accommodation/Salary feeds unchanged.
- Tokens; `next build --webpack`; tsc 0; eslint 0.
- **Verify before claiming** — name files/lines; mark build vs needs-live, and
  **include the "Pushed `<hash>`" line** (the income report omitted it and cost a
  verify cycle). I Chrome-verify both matrices: people=rows, days=columns, frozen
  person column + horizontal scroll, drag-to-select works, tints fill cells, week
  dividers/labels, per-column footers, cells write + persist, the budget feeds
  unchanged — AND the budget grid + Income grid + grid-demo are visually/behaviourally
  identical.
- Land smoke IDs + add Adam's manual smokes to `SMOKE_QUEUE.md`.
