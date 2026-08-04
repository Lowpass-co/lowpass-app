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

## Keyboard interaction contract (G1-C)

> The app-wide contract is written in `docs/design-tokens.md` §13: Tab always
> moves to the next entry (never traps), arrows navigate within, Enter selects,
> Esc exits. These IDs smoke the offenders that were fixed.

#### KEY-01 — Tab never traps
**Do**: Open a grid cell menu (routing/status/day-type), the Filter/Columns
popover, a `StyledSelect`, the `DayTypeCombobox`, or the venue autocomplete. Press Tab.
**Expect**: focus leaves the widget to the **next entry point**; the overlay
closes (grid menus) or the control commits/blurs natively. No widget swallows Tab.

#### KEY-02 — Arrows navigate within
**Do**: With a grid menu / `StyledSelect` / `DayTypeCombobox` open, press ↑/↓.
**Expect**: the highlight moves between options (roving), wrapping at the ends is
not required but the highlight is always visible. Enter selects the highlighted option.

#### KEY-03 — Esc exits, Enter selects
**Do**: Open any of the above; press Esc. Then reopen, highlight an option, press Enter.
**Expect**: Esc closes the overlay (grid menu / popover / select / combobox /
venue dropdown) without changing the value; Enter commits the highlighted option.
Venue autocomplete: Esc closes without committing; Tab blurs without committing
(only Enter/click pick).

**Remaining (follow-up, not a regression):** `ArtistTourSwitcher` complies on
Tab-not-trapped + Esc + Tab-reachable option buttons, but lacks arrow-key roving;
converging it (and `StyledSelect`) onto `BrandedSelect` (the compliant primitive)
is a later cleanup.

## Known broken

(None yet.)

## Retired

(None yet.)

## DataTable selection chrome (Assets cleanup)

The selection checkbox was a NATIVE `<input type="checkbox">`. `accentColor`
only colours the CHECKED fill, so on every dark surface the unchecked box
rendered as a bright white square — the thing Adam called "this weird white
tick box". All three call sites (row, header select-all, toolbar multi-select
filter) are now `appearance-none` boxes with a drawn tick, and selection reads
at 12% orange + an inset bar instead of a 5.1% tint you could not see.

| ID | Surface | Test | Expect |
|----|---------|------|--------|
| UI-DT-01 | /assets | Look at an unselected row's checkbox | An empty box outlined in `--lp-border-strong`. NO white fill. |
| UI-DT-02 | /assets | Tick one row | Box fills orange with a white tick; the row takes a 12% orange tint and a 2px orange bar down its left edge. |
| UI-DT-03 | /assets | Tick one row of many | Header checkbox shows a white DASH (half-state), not a tick and not empty. |
| UI-DT-04 | /assets | Tick every row | Header checkbox shows a tick. |
| UI-DT-05 | /assets | Keyboard-focus a row that is also selected | BOTH the focus ring and the selection bar are visible — they compose. (Before, the ring overwrote the bar.) |
| UI-DT-06 | /assets | Click a row's body, not its box | Opens the item slide-over and does NOT change the selection. |
| UI-DT-07 | /assets | Compare row height to Budget/Personnel tables | Assets rows are taller (`cozy`: 14px pad / 15px type). Other tables are unchanged — density is set on Assets only, not on the app preference. |
| UI-DT-08 | /assets | Open a toolbar multi-select filter | Its checkboxes match the table's, not white squares. |
| UI-DT-09 | Budget grid, Gear library, Tour personnel | Select rows | Same new box + tint. These share the primitive; only their looks changed, not their behaviour or density. |
