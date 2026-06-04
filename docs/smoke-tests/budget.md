# Budget smoke tests

> **Last bulk verification**: pending — first run on `feat/budget-grid-usable`
> (inline-edit grid + decouple row-click from slide-over).

Per `docs/smoke-tests/README.md`. Walk these on Vercel preview (or
local `npm run dev`) after every non-trivial budget change. ID prefix
is `BUD`. Open the Warning Support tour → Budget tab unless stated.

## Inline editing + persistence (Phase 0 — feat/budget-grid-usable)

#### BUD-01 — Actual edits inline and persists across reload

**Do**: Click the **Actual** cell on a non-derived line, type a value,
press Enter. Then reload the page.

**Expect**: The cell enters edit mode in place (orange-bordered input),
commits, and the value is still there after reload. The displayed value
updates **immediately** and does not flash back to the previous/zero
value (optimistic update). The slide-over does **not** open.

**Last verified**:

#### BUD-02 — Estimate edits inline and persists across reload

**Do**: Click the **Estimate** cell, change it, press Enter, reload.

**Expect**: Value commits and survives reload. Variance % and the
group/tour totals recompute. No flash to the old value.

**Last verified**:

#### BUD-04 — Status edits inline via dropdown

**Do**: Click the **Status** chip, pick a different status from the
inline dropdown.

**Expect**: Chip updates immediately to the new status + colour,
persists across reload, and an open slide-over for the same row
reflects the change. Escape cancels without changing.

**Last verified**:

#### BUD-05 — Phase edits inline via dropdown

**Do**: Click the **Phase** chip (or the "—"), pick a phase. If grouped
by Phase, watch the row.

**Expect**: Phase commits immediately and persists. With Group = Phase,
the row moves to the correct phase group on refresh. Choosing "—"
clears it.

**Last verified**:

#### BUD-06 — Slide-over opens only from the item title

**Do**: Click the **item title** (has the small open-panel icon).
Separately, click empty areas of the row and the number cells.

**Expect**: Only the title opens the slide-over. Clicking number cells
edits them in place; clicking elsewhere in the row does nothing. The
row is no longer a single big click target.

**Last verified**:

#### BUD-07 — Editing a cell never opens the slide-over

**Do**: Click Est total / Actual / Qty / Status / Phase to edit.

**Expect**: None of these open the slide-over (regression guard for the
row-click collision that previously hijacked every edit).

**Last verified**:

#### BUD-08 — Derived rows stay read-only on amounts

**Do**: On a flight/hotel/gear-derived line, try to edit Estimate or
Actual.

**Expect**: Those cells are display-only (no edit mode). Editing must
happen on the source flight/room/gear, per the existing 409 rule.

**Last verified**:

#### BUD-09 — Totals reconcile after an inline edit

**Do**: Edit any Est/Actual, note the group header "est/act" and the
filter-bar tour total "est … · act …".

**Expect**: Both the group subtotal and the tour-wide total update to
include the edit (in the selected display currency).

**Last verified**:

## Known broken / open

- **Actual vs transactions override math** — whether a manually-typed
  Actual that differs from the sum of transactions behaves correctly
  across reload is the open question gating a possible refactor of
  `src/lib/budget/transactions.ts`. Test: add 2 transactions to a line
  (sum e.g. $300), then type a different Actual ($350) inline → expect
  an override marker (⚠) + the typed value sticking; clicking the
  slide-over "Sync to transactions sum" resets to $300. Report drift.
- **Template / empty-state** — a blank budget should scaffold from a
  reusable template (workspace default + per-artist override, GN
  structure). Not built yet (Phase 2). No test IDs yet.
- **Item-cell polish (CC)** — title should be inline-editable; the
  open-detail affordance should be a clearer, larger, centred button
  with a hover/click animation. Handed to Claude Code (UI/UX + 21st).
- **Status/Phase dropdown styling** — currently a native `<select>`
  (looks like default Safari). To be replaced with a custom dropdown
  matching the chips. Functionally works + propagates; cosmetic only.
