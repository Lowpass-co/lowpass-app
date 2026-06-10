# CC — Rooming: restructure to the shared rail + 3 views

Rooming **already exists** (`src/components/rooming/RoomingMasterGrid.tsx` +
`RoomingView.tsx`, `/operations/[tourId]/rooming`). It renders **people-rows ×
date-columns** today, with the right room codes (`SGL · DBL (A/B/C/D) · —`,
`ROOM_OPTIONS`) and an optimistic cell editor. This is a **restructure**, not a
rebuild: flip orientation to the shared rail, add two more views, keep the data
layer + the derived budget feed.

Schema (migration 051): `hotels` · `rooms` (room_number/type/cost/bed_count) ·
`room_assignments` (room_id·person_id·starts_on·ends_on). Roster from
`tour_personnel`. Derived budget Accommodation lines come from
`reconcileDerivedLines` (`source_entity_type='hotel_booking'`, now persisting
post-208).

## ⛔ Gated: Stage A (map, no code) → review → Stage B

### Stage A — map (NO code) → `docs/handover/ROOMING_MAP.md`
1. The real data path: how the per-person-per-night **room-type code** maps to
   `hotels/rooms/room_assignments` (cite `api/budget/rooming/route.ts` +
   `RoomingMasterGrid` fetch/write). Where does the `DBL (A)` code live — a column,
   or derived from a shared room row? How is a **shared room** (two people, same
   letter) represented?
2. Current component structure (`RoomingMasterGrid` + `RoomingView`) + the props
   it already takes (`routingDates`, `roster`, `currency`).
3. How rooming feeds the budget (reconcile → hotel_booking lines) — confirm
   unchanged.
4. Decisions for Adam (e.g. does the room-code editor write a `rooms` row +
   `room_assignment`, or a denormalised grid cell? cost source per room/night?).
   Then stop.

### Stage B — build (after the map is approved)
1. **Flip orientation to the shared `<RoutingRail>`**: nights down the left rail
   (date · city · day-type pill, from routing — the proven RoutingRail), people
   **across the top**. (App-wide consistency: days always on the left. The
   current people-rows/date-columns layout is replaced.)
2. **Three views over one dataset** (view switcher; rail is the constant):
   - **Matrix** — rail(nights) × people, each cell a room code
     (`SGL / DBL (A…) / —`); roommates share a letter; colour-keyed; footer rooms-
     per-night. Off/no-room nights blank.
   - **Nights overview** — one row per hotel stay: hotel · city · in–out · nights ·
     room-type counts (S/D/T) · pax · cost; footer totals.
   - **Cards** — rail(nights) + the selected night's **room cards** (occupant
     chips) + an unassigned pool; assign by picking into a room.
3. **Room-code editor** = pick `SGL / DBL (A/B/C/D) / —` (existing `ROOM_OPTIONS`)
   or add a new letter; the **letter is the shared-room identity** (so the app
   bills one shared room once). Keep the optimistic-update behaviour (OPS-04).
4. **Canonical grid styling** incl. the **section gutter** (left-gutter labels,
   not band rows) where sections apply.
5. **Derived budget Accommodation** must keep working (per-room/stay lines via
   reconcile) — verify after.
6. Day-type from routing drives which nights have rooms.

## Clarifications (answers to CC's Stage-A questions, 2026-06-10)

**Q1 — How does the Matrix "reuse the rail" if the rail is a `<ul>`?**
It does NOT embed the `<RoutingRail>` `<ul>` literally. Factor the rail's
**single-entry renderer** (one night = date · city · day-type pill, from
`RailEntry` + the day-type tokens) into a small shared presentational piece.
Then:
- **Cards / Nights** use the literal `<RoutingRail>` (`<ul>`) as the sidebar.
- **Matrix** uses that same per-entry renderer as the **left column / row
  headers** of the CSS-grid matrix (nights down, people across), so it looks
  identical to the rail but lives in the grid.
"Reuse the rail" = reuse its entry-cell + data shape + styling, not its `<ul>`
container. Days stay on the left in all three.

**Q2 — Which routing nights get room columns/cells?**
Every **night away** = all **Show + Off/Travel** routing dates (exclude
**No-Tour / home** days). Each such date is a matrix row (and a Cards rail item);
the cell is a room code (`SGL / DBL (A…)`) or `—` (no room that night). NOTE this
differs from the Advance rail (show-days-only) — rooming needs every night you
sleep away, not just show nights. So the rooming rail/matrix filter = **nights
away**, not shows. (Adam's sheet shows every tour date incl. checkout days as
`—`.)

**Q3 — Nights-overview: what is one row?**
**One hotel stay** — i.e. one `hotels` record: hotel · city ·
check-in → check-out · nights · room-type counts (S/D/T) · pax · cost,
aggregating that hotel's `rooms`. NOT one row per night. (This is the "how many
rooms am I paying for, where" scan; the per-night/per-room granularity lives in
the derived budget Accommodation lines.)

## Hard rules
- Map both sides before writing; cite real columns; don't guess the room-code↔
  room mapping. Surface decisions.
- Reuse `<RoutingRail>` (don't reinvent). Tokens; `next build --webpack`; tsc 0;
  eslint 0; don't regress the OPS rooming fixes or the derived budget feed.
- **Verify before claiming** — name files/lines; mark build/code-verified vs
  needs-live. I Chrome-verify all 3 views + the budget feed on the preview.
- Land smoke IDs in `docs/smoke-tests/operations.md` (rooming) / a rooming file.
