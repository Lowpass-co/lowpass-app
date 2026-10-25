# Home / artist-scope smoke tests

> **Last bulk verification**: (pending — feat/ia-tour-flow-fix)

Walk these after changes to the artist home, the ProductRail, or the
tour-selection flow. Format defined in `docs/smoke-tests/README.md`.
Prefix: `HOM`.

## Tour selection (IA tour-flow fix)

#### HOM-01 — No tour selected → picker hero + dimmed rail

**Do**: Open an artist home (`/artists/[id]`) with no tour selected
in context.

**Expect**: A "Pick a tour to get started" hero with the artist's
tours as selectable cards (status stripe, dates, show count, last
activity). The left rail's Operations / Budget / Advance icons are
dimmed (opacity ~0.4, title "… — pick a tour first").

**Last verified**:

#### HOM-02 — Pick a tour → opens it + active banner + rail unlocks

**Do**: Click a tour card.

**Expect**: Lands on `/budget/{tourId}`. Return to the artist home →
the picker is replaced by a compact "Active tour: {name}" banner with
Operations / Budget / Advance quick links; rail icons are no longer
dimmed.

**Last verified**:

#### HOM-03 — Dimmed rail icon routes to artist home, never 404

**Do**: With no tour selected, click a dimmed rail icon
(Operations / Budget / Advance).

**Expect**: Navigates to the artist home (where a tour gets picked) —
not a dead workspace route or a 404.

**Last verified**:

#### HOM-04 — Workspace landings prompt or auto-redirect

**Do**: Visit `/operations` and `/advance` directly — first with no
tour in context, then with a tour selected.

**Expect**: No tour → a "Select a tour to open {product}" card with a
link to /artists. Tour selected → hard-redirects to
`/operations/{tourId}` / `/advance/{tourId}`.

**Last verified**:

#### HOM-05 — "Change tour" reopens the picker

**Do**: With a tour selected, click "Change tour" on the active-tour
banner.

**Expect**: The picker hero reappears (selection cleared); no tour is
auto-reselected.

**Last verified**:

## Root entry (Salvage #5 — single-artist auto-skip)

#### HOM-06 — Single-artist workspace auto-skips the picker

**Do**: As a signed-in user whose workspace has exactly **one** artist,
navigate to `/`.

**Expect**: Hard-redirect straight to `/artists/{thatArtistId}` (the artist
Home), skipping the `/artists` picker. A workspace with **two or more**
artists lands on `/artists` as before. Unauthenticated → `/artists`
(which bounces to `/login`).

**Last verified**:

#### HOM-07 — Explicit ?next= wins over auto-skip

**Do**: While signed in, open `/?next=/budget/SOME_TOUR_ID` (safe internal
path). Try a single-artist and a multi-artist workspace.

**Expect**: Redirects to `/budget/SOME_TOUR_ID` in both cases — the explicit
destination overrides both the picker and the single-artist auto-skip.
Protocol-relative / external `next` (`//evil.com`) is ignored (falls through
to the normal picker / auto-skip).

**Last verified**:

## UX-walk mechanical fixes (§A items 1–7)

- **UXW-01** (needs-live) Ops summary "Upcoming shows" dates match the Routing
  grid + Advance list exactly (no one-day-early shift) — date-only strings now
  parse local, not UTC (`parseRoutingDate`).
- **UXW-02** (needs-live) "Next show" everywhere is the first **Show Day**, not
  the first routing row: workspace artist card NEXT chip skips day-off / travel /
  rehearsal rows (ops SHOWS stat already filtered).
- **UXW-03** (needs-live) Advance header reads "N shows · M days" (show/festival
  count + total dated routing days) — routing rows are never called "shows".
- **UXW-04** (needs-live) Workspace + artist activity feeds no longer show an
  all-"—" Actor column (dropped; the data only existed for a subset of rows).
- **UXW-05** (needs-live) Artist-home "Pick a tour" panel copy no longer mentions
  the retired left rail ("…unlock Operations, Budget and Advance in the bar above").
- **UXW-06** (needs-live) Workspace stat reads "N ON TOUR NOW" (was "ACTIVE
  TOURS", which collided with the "Active tour" selection banner); shows "N IN
  PLANNING" when nothing is live.
- **UXW-07** (needs-live) Currency whiplash: the workspace "£X COMMITTED"
  mixed-currency aggregate is **deleted**; the artist "Budget committed" stat now
  states its display currency ("· GBP").

## Tour strips + overview tidy (Oct 2026)

- [ ] **HOME-ST-01 — Strip is one even line.** Workspace cards and artist tour
  rows: every day is the same height, colour = day type, never two lines at any
  width (try a phone width too). No flicker on load, no wobble when the mouse
  runs along it.
- [ ] **HOME-ST-02 — Today.** On a running tour a light vertical line sits on
  today's day, inside the strip (nothing pokes out). Days before it are dimmed.
  Start / end dates sit under the strip; "Today" appears under it when it
  isn't crowding the ends. Hover a day → one line: "Sun 25 Oct (today) · Show
  Day · city".
- [ ] **HOME-ST-03 — Key.** One key per section (Artists header, Tours header)
  listing only the day types present, plus Today and Past. Hidden on phones.
- [ ] **HOME-ST-04 — Cards don't clip.** "Tour running · day 25 of 31" shows
  whole letters; the next-show date is the same size as "Next show".
  An artist with no tours reads "No tours yet" once (no duplicate "Nothing
  booked").
- [ ] **HOME-ST-05 — Card order.** On tour first, then by nearest next show,
  then the rest A–Z.
- [ ] **HOME-ST-06 — Shows this month.** The workspace figure counts show and
  festival days only (it used to count every routing day — 31 in October).
- [ ] **HOME-ST-07 — Tour pill is date-derived.** A tour within its dates reads
  ON THE ROAD with "Day N of M · ends in X days"; future = UPCOMING; past =
  wrapped; no dates = DATES TBC. Never "PLANNING" on a running tour.
- [ ] **HOME-ST-08 — Budget figure.** The artist stat line shows "$X BUDGETED ·
  <tour>" = that tour's Total expenses (proposed) on its budget sheet, in its
  currency. No figure when the artist has no current or upcoming tour. (Replaces
  "committed", which summed every tour in mixed currencies — UXW-07 retired.)
- [ ] **HOME-ST-09 — Recent activity.** No "Tour metadata updated" rows; advance
  rows name their tour and only this artist's advances appear.
- [ ] **HOME-ST-10 — Phone width.** Artist page tour rows: the strip sits under
  the name, full width; past tours wrap without clipping.

## Known broken

(None yet.)

## Retired

(None yet.)
