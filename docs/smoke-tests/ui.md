# UI primitives smoke tests

> **Last bulk verification**: (pending — design/ux-audit-2026)

Walk these after changes to the shared primitives (`src/components/ui`)
or the page-header sweep. These are app-wide, not one product. Format
defined in `docs/smoke-tests/README.md`. Prefix: `UI`.

## Canonical primitives (UX Audit 2026)

#### UI-01 — Button variants are uniform

**Do**: Find a primary and a secondary button on any converted surface.

**Expect**: Primary = brand orange; secondary = outline. Both show a
visible focus-visible ring; `loading` buttons show a spinner, go
disabled, and preserve width.

**Last verified**:

#### UI-02 — PageHeader is uniform across pages

**Do**: Visit Venues, Bugs, Settings, Equipment.

**Expect**: Each page's header renders through `<PageHeader>` — same
title scale (`font-display`, 2xl, bold), subtitle treatment, and
right-aligned actions slot.

**Last verified**:

#### UI-03 — Modal behaves consistently

**Do**: Open any dialog built on `<Modal>` (e.g. Send Packet).

**Expect**: Scale-in enter animation; closes on Escape and backdrop
click; focus moves into the dialog and restores on close; body scroll
locked while open. Animation is suppressed under
`prefers-reduced-motion`.

**Last verified**:

#### UI-04 — TextInput / NumberInput affordances

**Do**: Find a field using `<TextInput>` / `<NumberInput>`.

**Expect**: Label + focus ring; read-only renders distinct from
disabled; required shows an asterisk; errors set `role="alert"` +
`aria-describedby`. NumberInput right-aligns with tabular figures.

**Last verified**:

## Grid design system (grid-system sprint)

#### UI-05 — Density is one app-wide preference (3 levels)

**Do**: On the Budget grid, click the density toggle and pick
**Spacious**. Then navigate to Personnel, Equipment, Tours, the Channel
list and Payroll spreadsheets.

**Expect**: Row height AND type size change on **every** grid (not just
Budget). Default on first load is **Comfortable**; the three levels are
Compact · Comfortable · Spacious. The choice is one shared preference
(localStorage `lowpass:density`) — it persists across reloads and is the
same on all surfaces.

**Last verified**:

#### UI-06 — Grids are full-width elevated panels

**Do**: Open the Budget grid, a list surface (Tours or Personnel), and a
spreadsheet (Channel list or Payroll).

**Expect**: Each grid **fills its container width** and reads as one
**elevated panel** — its own surface background, a crisp border + faint
ring + soft shadow. Numeric columns are right-aligned with tabular
figures.

**Last verified**:

## Known broken

(None yet.)

## Retired

(None yet.)
