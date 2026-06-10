# ROOMING_MAP — Stage A (map only, no code)

> Restructure Rooming to the shared `<RoutingRail>` + 3 views (Matrix / Nights
> overview / Cards) over the **existing data layer**. This is a re-orientation,
> not a rebuild: keep the tables, the API routes, the optimistic cell editor,
> and the derived budget feed. No code yet — decisions in §6, then stop.
>
> **Status:** Stage A. Awaiting Adam's review + D1–D7 before Stage B.

---

## 0. TL;DR

- The room code (`SGL` / `DBL (A..D)` / `—`) is a **literal string in
  `rooms.room_type`** — NOT a separate letter column, NOT derived. (`rooms`,
  migration 051.)
- A **shared room** = ONE `rooms` row per `(hotel_id, room_type)`; each occupant
  is a `room_assignments` row pointing at the same `room_id`. So **the letter is
  the shared-room identity within a hotel** — exactly the "bill one shared room
  once" model the prompt wants. Already true today.
- Each grid cell writes a **single-date** assignment (`starts_on = ends_on =
  routingDate`) via `POST /api/budget/rooming`, which find-or-creates the
  `rooms` row + upserts the `room_assignments` row. **Keep this write model
  byte-for-byte** so the budget feed is unchanged.
- The derived Accommodation budget feed (`reconcileDerivedLines` →
  `source_entity_type='hotel_booking'`) reads `hotels`/`rooms`/
  `room_assignments` and costs `rooms.cost_amount × nights` **once per room**.
  Restructure must not touch how assignments are written, or these numbers move.
- All 3 new views can be built over the **existing endpoints** + the page's
  existing `hotels(*, rooms(*, room_assignments(*, persons)))` fetch. **No
  schema change, no new API** is required (pending D2).

---

## 1. The data path (room-code ↔ room mapping)

### Tables (migration `051_room_canonical.sql`)

```sql
hotels(id, workspace_id, tour_id, name, address, city, country, phone,
       confirmation_number, check_in_at, check_out_at, show_id→routing, notes, …)

rooms(id, workspace_id, hotel_id→hotels, room_number, room_type, cost_amount
      numeric(12,2), cost_currency default 'GBP', bed_count int, notes, …)

room_assignments(id, workspace_id, room_id→rooms, person_id→persons,
                 starts_on date, ends_on date, UNIQUE(room_id, person_id, starts_on))
```

- **`rooms.room_type` holds the literal code** (`'SGL'`, `'DBL (A)'`, `'-'`).
  `ROOM_OPTIONS` (RoomingMasterGrid L9–16) is the hardcoded picker; `RoomType`
  union (`types/index.ts` L422) = `'SGL'|'DBL (A)'|'DBL (B)'|'DBL (C)'|'DBL (D)'|'-'|'N/A'`.
- **`bed_count` and `room_type` are independent** — no bed_count→type mapping.
- **Cost** = `rooms.cost_amount` (per-night rate, GBP default).

### Write path (the matrix cell editor) — `POST /api/budget/rooming` (route.ts)

Body `{ tour_id, person_name, routing_id, room_type, cost_amount? }`. Per cell:
1. Resolve `person_id` from `persons.full_name` ILIKE `person_name` (L215–222).
2. Resolve/create the **hotel** for that routing date (else an "Unassigned
   Hotel") (L228–258).
3. **Find-or-create the `rooms` row by `(hotel_id, room_type)`** (L265–295) —
   `cost_amount` set/updated from the assumed rate (OPS-04).
4. **Upsert the `room_assignments` row** keyed `(person_id, starts_on, ends_on)`
   with `starts_on = ends_on = routingDate` (L298–328). **Single-date per cell.**

⇒ Two people picking `DBL (A)` for the same hotel-night resolve to the **same
`room_id`** (step 3 dedups by `(hotel_id, room_type)`), with two assignments.
**The letter = the shared room.** `DELETE /api/budget/rooming { id }` removes one
assignment.

### Read paths

- `GET /api/budget/rooming` → `grid_by_person` (person → per-date `room_type`).
- The **page** (`operations/[tourId]/rooming/page.tsx` L31–49) also fetches
  `hotels(*, rooms(*, room_assignments(*, persons(full_name))))` + routing +
  roster — **enough to build all 3 views client-side** without new queries.
- Hotel-sheet edits go through `PATCH /api/budget/hotels/assignments`
  (assignment + linked room fields) and `/api/rooms/[id]` (room cost/type).

### Roster

`tour_personnel` (migration 050) → `person_id` + `role`; names via
`persons.full_name` (the canonical key cells/saves use). One grid row per roster
member even with zero assignments (FOUNDATION FIX).

---

## 2. Current components + props

| File | Role | Props |
|---|---|---|
| `RoomingView.tsx` | container; tabs = **Master Grid** + one tab per hotel | `{ tourId, tourName, currency, routingDates[], hotels[], roster: RosterPerson[] }` |
| `RoomingMasterGrid.tsx` | people-rows × date-cols matrix; `ROOM_OPTIONS`; optimistic `saveCell` (OPS-04); SGL=blue/DBL=purple tint; footer rooms-per-night; off-roster section + delete (OPS-03/14) | `{ tourId, currency, routingDates[], roster: RosterPerson[] }` |
| `RoomingHotelSheet.tsx` | per-hotel detail table (check-in/out/nights/type/rate/total) | `{ hotelBooking, roomAssignments: Assignment[], currency }` |
| page `operations/[tourId]/rooming/page.tsx` | server fetch + mount `<RoomingView>` | — |

`RosterPerson = { person_id: string|null; person_name: string; role: string }`.
`routingDates[] = { id, date, venue_name?, city?, day_type? }` — **already the
shape `RailEntry` needs** (id/date/city/dayType).

Key reusables to KEEP: `saveCell` optimistic write (OPS-04), `roomNights`
dedup-by-letter count (L189–206), off-roster detection + `deleteOffRoster`
(OPS-03/14), the `assumedRate × roomNights` footer.

---

## 3. Budget feed (must stay unchanged)

`src/server/budget/reconcileDerivedLines.ts` `computeHotelDesired` (L64–150):
- reads `hotels` → `rooms(id, hotel_id, cost_amount, room_type)` →
  `room_assignments(room_id, starts_on, ends_on)`;
- **collapses each room's assignments to one range** (earliest start → latest
  end) so a shared room is costed **once**;
- `cost = cost_amount × nightsBetween(range)`, summed per hotel;
- emits one line per hotel: `source_entity_type='hotel_booking'`,
  `source_entity_id = hotels.id`, `hotel_id = hotels.id`, label
  `"{hotel} — {types}"`, `proposed_cost=actual_cost=Σ`. Persisted post-208.

**Invariant for Stage B:** keep writing **single-date** assignments via the
existing POST (don't switch to ranges, don't change `cost_amount` semantics) →
the feed is identical. Any restructure that batches/writes ranges WILL move the
numbers.

> ⚠️ **Pre-existing costing quirk (NOT in scope, flag to verify):** because each
> assignment is single-date (`starts_on==ends_on`), a room's collapsed range is
> `[earliestDate, latestDate]` and `nightsBetween` returns the **day-span**, not
> the **count of roomed nights**. A room used on exactly one night yields span
> `0` → `£0`; a 2-night room yields `1`. This is existing behaviour. Stage B
> must **not change it** (keep single-date writes) and **verify the budget total
> is identical** before/after. Fixing the quirk is a separate task (D5).

---

## 4. The 3-views plan (over one dataset)

A view switcher; the rail is the constant; all writes via the existing endpoints.

1. **Matrix** — nights (rail, left) × people (columns). Each cell a room code
   (`SGL`/`DBL (A…)`/`—`), roommates share a letter, SGL=blue/DBL=purple, footer
   rooms-per-night. Off/no-room nights blank. *(Today's grid, transposed.)*
2. **Nights overview** — one row **per hotel stay**: hotel · city · in–out ·
   nights · room-type counts (S/D/T) · pax · cost; footer totals. *(Built from
   `hotels` + nested rooms/assignments; close to RoomingHotelSheet aggregated.)*
3. **Cards** — rail(nights) + the selected night's **room cards** (occupant
   chips) + an **unassigned pool** (roster with `—` that night); assign by
   picking a person into a room card → the same `POST` (that night, that
   `room_type`).

**Data sources per view** (all already fetched): Matrix ← `grid_by_person` +
roster + routingDates; Nights ← `hotels(*, rooms(*, room_assignments))`; Cards ←
the per-night slice of the same.

---

## 5. RoutingRail integration — the one structural question

`<RoutingRail>` (shipped) renders a **vertical nav list** (`<nav><ul><li>`), one
night per `<li>` (date · city · day-type pill · selected highlight), caller-
controlled `selected`/`onSelect`, `grouping='night'`. That's a perfect fit for
**Cards** (and as the left index of **Nights**): click a night → show its cards.

But the **Matrix** needs nights as the **row axis of a grid** with people-cells
aligned per row — a CSS grid (col 1 = night, cols 2..N = people), not a `<ul>`
nav list. RoutingRail's `<ul><li>` structure doesn't host aligned cell columns.
So "reuse the rail" for the Matrix needs a decision (D1).

Recommended resolution (D1): **extract the rail's night-cell rendering into a
small presentational `RailNightCell` (date · city · day-type pill · selected
state, the shared dayType tokens)** that BOTH `RoutingRail` (nav, Cards/Nights)
and the **Matrix grid's column 1** render. "Reuse RoutingRail" is satisfied by
sharing the exact night-cell (one component, identical look + tokens), while the
Matrix stays a real CSS grid. No reinvention, days literally on the left.

---

## 6a. Adam's answers (2026-06-10) — locked for Stage B

- **D1 → shared entry renderer (NOT the `<ul>`).** Factor the rail's single-entry
  renderer (one night = date · city · day-type pill) into a small shared piece.
  **Cards + Nights** use the literal `<RoutingRail>` sidebar; the **Matrix** uses
  that same entry renderer as its left column / row-headers of the CSS grid
  (nights down, people across). "Reuse the rail" = reuse its entry cell + data
  shape + tokens, not its `<ul>`. Days stay on the left in all three.
- **D4 → every night AWAY.** All **Show + Off/Travel** routing dates; **exclude
  No-Tour/home** days. Each is a Matrix row + a Cards rail item; the cell is a
  room code or `—`. This differs from Advance's show-days-only rail: rooming
  needs every night you sleep away. The caller (rooming) **pre-filters entries to
  nights-away** and passes that set to `<RoutingRail>` — no rail change (the rail
  already takes a caller-filtered `entries[]`). Confirmed.
- **D6 → one row per hotel stay.** Nights overview row = one `hotels` record:
  hotel · city · check-in→check-out · nights · room-type counts (S/D/T) · pax ·
  cost, aggregating that hotel's rooms. Per-room/night granularity lives in the
  derived Accommodation budget lines, not here.
- **D2 / D3 / D5 / D7 → recommended defaults stand** (write via the existing
  `POST /api/budget/rooming` single-date model; cost = `rooms.cost_amount`; the
  single-date costing quirk stays out of scope, verify budget total unchanged;
  preserve OPS-03/14 off-roster + delete).

> Stage B build note: extract a presentational `RailNightCell` (date · city ·
> day-type pill · selected state, shared dayType tokens) used by BOTH
> `RoutingRail` (Cards/Nights) and the Matrix grid's left column. Rooming filters
> `routingDates` to **nights-away** (show + off/travel, excluding no-tour/home)
> before building `RailEntry[]`.

## 6. Decisions for Adam (D1–D7) — ANSWERED (see §6a)

- **D1 — Rail in the Matrix.** Extract a shared `RailNightCell` used by both
  `RoutingRail` (Cards/Nights nav) and the Matrix grid's left column, so the
  Matrix is a real CSS grid with the *same* night cell on the left? Or force the
  Matrix through the `<ul>` rail some other way? *(Recommend the shared
  `RailNightCell` — one cell component, true row alignment, days-on-left.)*
- **D2 — Write model unchanged.** All 3 views (incl. Cards "assign into a room")
  write via the **existing `POST /api/budget/rooming`** (single-date
  assignment, find/create room by `(hotel_id, room_type)`). No new endpoints, no
  schema change. Confirm? *(Recommend yes — keeps the budget feed identical.)*
- **D3 — Cost editing.** Matrix keeps the single **assumed rate** → `cost_amount`
  on POST; per-room/stay rate is edited in **Nights overview** (reuse
  `/api/rooms/[id]` / `/api/budget/hotels/assignments` PATCH which set
  `rooms.cost_amount`). Cost source stays `rooms.cost_amount`. Confirm?
- **D4 — Which nights are roomable.** The rail shows **all** routing nights
  (`grouping='night'`, no show-day filter — unlike Advance), day-type pill shown,
  off/travel nights roomable but blank by default. Confirm? *(vs only
  show/hotel nights.)*
- **D5 — Shared-room letter scope + the costing quirk.** Confirm the letter =
  per-hotel shared-room identity (as built). And confirm the §3 **single-date /
  span costing quirk is OUT of scope** here (keep writes single-date, verify the
  budget total is unchanged) — fixed later as its own task? *(Recommend yes.)*
- **D6 — Nights overview grouping.** One row **per hotel (stay)** using
  `hotels.check_in_at/out` + room-type counts + Σ cost (vs one row per night).
  Confirm per-hotel?
- **D7 — Off-roster + delete carry-over.** Preserve OPS-03/14: off-roster people
  who hold a room are shown (extra people-columns in Matrix / extra occupant
  chips in Cards) with the delete action. Confirm carry-over?

---

## 7. Hard-rule compliance (Stage A)

- ✅ Both sides mapped; **real columns cited** (051 hotels/rooms/
  room_assignments; 050 tour_personnel; route.ts write path; reconcile feed) —
  the room-code↔room mapping is traced, not guessed.
- ✅ Confirmed the budget feed's exact dependencies + the write invariant.
- ⛔ **No code written.** Stopping for D1–D7 review before Stage B.

### Stage B smoke IDs (to land with the build — placeholders)

New `docs/smoke-tests/operations.md` rooming block (or a rooming file):
- **ROOM-01** Rail (nights) on the left on all 3 views; day-type pill from routing.
- **ROOM-02** Matrix: nights × people, room codes, roommates share a letter,
  SGL/DBL colour, footer rooms-per-night; optimistic save survives reload (OPS-04).
- **ROOM-03** Nights overview: one row per hotel stay; type counts + Σ cost; totals.
- **ROOM-04** Cards: pick a night → room cards + unassigned pool; assign writes a
  room_assignment (same POST); survives reload.
- **ROOM-05** Off-roster people shown + deletable (OPS-03/14 preserved).
- **ROOM-06** Derived Accommodation budget total **unchanged** vs pre-restructure
  (same hotels/rooms/assignments; reconcile feed intact).
