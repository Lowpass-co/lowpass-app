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

## Known broken

(None yet.)

## Retired

(None yet.)
