# Rooming smoke tests

> Stage B restructure: the shared `<RoutingRail>` + 3 views (Matrix / Nights /
> Cards) over the existing data layer. Map: `docs/handover/ROOMING_MAP.md`.
> ID prefix `ROOM`; IDs never recycled. Reference tour: "Simple Plan Support |
> Fall'26" (or any tour with hotels + roster).

## Status snapshot (2026-06-10 — Stage B landed, needs-live)

| ID | Result | Note |
|----|--------|------|
| ROOM-01 | code-verified | rail (nights) on the left of Matrix + Cards; day-type pill from routing |
| ROOM-02 | code-verified | Matrix: nights × people, room codes, shared letter, colour, footer |
| ROOM-03 | code-verified | Nights overview: one row per hotel stay; S/D/T + Σ cost; totals |
| ROOM-04 | code-verified | Cards: pick a night → cards + unassigned pool; assign writes |
| ROOM-05 | code-verified | off-roster occupants shown + deletable (OPS-03/14 preserved) |
| ROOM-06 | **needs-live** | derived Accommodation budget total unchanged vs pre-restructure |

`tsc` 0 · `eslint` 0 · `next build --webpack` green at this commit.

---

## What changed (Stage B)

- `RoomingView` is now a **3-view switcher** (Matrix · Nights · Cards), default
  **Matrix**. Nights filtered to **nights-away** (`isNightAway` — all show /
  off / travel etc., excluding explicit home/no-tour).
- Shared **`RailNightCell`** extracted from `RoutingRail` (date · city ·
  day-type pill) — Cards/Nights use the literal `<RoutingRail>`; the **Matrix**
  uses `RailNightCell` as its sticky left column (D1). Advance unaffected.
- Shared **`useRoomingGrid`** hook — one copy of fetch / optimistic `saveCell`
  (OPS-04) / off-roster (OPS-03/14) / room-night maths. **Write path unchanged**
  (`POST/DELETE /api/budget/rooming`, single-date assignment) → budget feed
  identical. The old `RoomingMasterGrid` is removed (replaced by the Matrix).
- Page adds an additive read-only `room_id` to each flattened hotel assignment
  so the Nights overview can group + cost per ROOM (matching reconcile).

---

## ROOM-01 — Rail on the left, every view
**Do**: Open `/operations/[tourId]/rooming`. Switch Matrix → Cards.
**Expect**: nights run **down the left** as the rail (date · city · day-type
pill, identical look to Advance's rail). Matrix = sticky left column; Cards =
the literal `<RoutingRail>` sidebar (click a night to select it).

## ROOM-02 — Matrix (nights × people)
**Do**: In Matrix, set a person's cell to `SGL` / `DBL (A)` / `—`; give two
people the same `DBL (A)` on a night.
**Expect**: roommates share the letter (one shared room); SGL≈blue / DBL≈violet
tint; the trailing **Rooms** column + footer total count each distinct DBL once
and each SGL once; edits are optimistic (no reload) and survive reload (OPS-04).

## ROOM-03 — Nights overview (one row per hotel stay)
**Do**: Switch to **Nights**.
**Expect**: one row per hotel: hotel · city · in→out · nights · S/D/T room
counts · pax · cost; footer totals. Cost groups by room (shared room once),
matching the derived Accommodation lines. Click a row → its detail sheet opens
below (edit rates/confirmation — D3).

## ROOM-04 — Cards (assign into a room)
**Do**: Switch to **Cards**, pick a night. Assign a pooled person a room via the
`＋ room…` picker; remove an occupant via the chip ✕.
**Expect**: the night's rooms render as cards (occupant chips, colour-keyed) +
an **unassigned pool**; assigning writes the same `room_assignment` (same POST),
optimistic, survives reload.

## ROOM-05 — Off-roster preserved (OPS-03/14)
**Do**: Have a person who holds a room but isn't on the roster.
**Expect**: they appear as a **greyed people-column** in the Matrix (and as
occupants in Cards) with a ✕ to remove all their assignments. Not a phantom
roster row.

## ROOM-06 — Budget feed unchanged  ⟵ Adam, Chrome
**Do**: Note the Budget → Expenses **Accommodation** total before, do some
rooming edits that net to the same rooms, then re-open Budget.
**Expect**: the derived `hotel_booking` Accommodation lines reconcile exactly as
before (same hotels/rooms/assignments; the restructure changed no writes).

## Matrices rebuilt ON the canonical `<Grid>` (wide mode) — MTX-01…09 (2026-06-11)

> RoomingMatrix + PayrollDaysMatrix are now **`<Grid>` instances** (people =
> rows, days = dropdown columns), via additive opt-in "wide mode". Map:
> `docs/handover/MATRIX_ON_GRID_MAP.md`. `tsc` 0 · `eslint` 0 · build green ·
> adapter 7/7 · fees 8/8.

**Additive `<Grid>` changes (all default-off → budget/income/demo unchanged):**
`wide?` (data-wide) · `frozenCols?` (sticky-left) · `headerFor?` (day-pill
headers) · `columnFooter?` (rooms-per-night) · `Column.ro` (frozen person col,
read-only) · `Column.optLabels` (pretty dropdown text) · `row._rowClass`
(off-roster greying) · dropdown cell-fill tint in wide. **Budget invariant
proven:** grep shows no consumer in `src/components/budget/*` or `grid-demo/*`
sets any of these → `BudgetGridView.tsx`, `BudgetIncomeGrid.tsx`,
`gridModel.ts` (`template()`), and `/grid-demo/*` are byte-for-byte unchanged.

- **MTX-01** Both matrices: people = rows, days = columns (orientation flipped).
- **MTX-02** Frozen person column + horizontal scroll (names stay visible).
- **MTX-03** Native drag-select range + ring across day cells (the lost feature).
- **MTX-04** Day-cell dropdown **tints fill the cell** (room code / day status).
- **MTX-05** Edit a cell → writes via `saveCell`/`saveDayStatus` (optimistic, no
  reload); **budget Accommodation + Salary feeds unchanged**.
- **MTX-06** Rooming **rooms-per-night** column footer; shared-room letter count.
- **MTX-07** Payroll **week markers** (label + orange divider on each Monday
  day-header); all routing dates incl. no-tour.
- **MTX-08** Off-roster people = **greyed rows** + a remove strip (✕); roommates
  keep their room when one is removed.
- **MTX-09** **Budget grid (Expenses + Income) + `/grid-demo` visually +
  behaviourally identical** — the invariant.
