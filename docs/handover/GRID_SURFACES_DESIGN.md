# Grid surfaces — design notes (Payroll · Rooming · Channel list · shared Export)

Captured from the 2026-06-08 visual review. These are the surfaces that adopt
the canonical `<Grid>` after Budget (Phase 5+). One grid engine, per-surface
column sets + adapters, plus a shared export tool. Build for real (Chrome-verified),
not in the sandbox — the playbox's job is done; rooming is the only surface that
warranted visual design iteration first (this doc records its outcome).

## Rooming — ONE dataset, THREE views (Adam: "all of those ideas")
The card view alone isn't data-dense enough to scan a whole tour. Rooming gets a
view switcher (like sheet tabs), all reading/writing the same rooming lines
(which already roll into the budget Accommodation section):

1. **Tour matrix** (default for scanning) — people down the side, **every night
   across the top** (date + city), each cell = room no. + type, **shared rooms
   colour-grouped** (roommates share a colour), travel/off nights blanked. A
   footer "Rooms per night" count. This is the Google-Sheets rooming-list view.
2. **Nights overview** — one row per hotel stay: hotel · city · in–out · nights ·
   S/D/T room-type counts · pax · cost; footer totals (rooms, pax, spend). The
   "how many rooms am I paying for, where" scan.
3. **Cards** (assignment/edit) — per hotel-night room cards with occupant chips +
   an unassigned pool; drag a person into a room. Best for building a single
   night.

Open question for Adam (to finalise matrix/cards interaction): in the sheet
today, is the primary axis people×nights (matrix) or per-night room blocks? And
how are shared rooms / room types entered — typed, or picked? A `<thinking>`
dump of the real workflow will tune the default view + the cell editor.

## Payroll — grid + week rail + full sheet parity + export
- Canonical grid, payroll column set (person · role · show rate · travel rate ·
  per diem · show days · travel days · **computed total fee**), Advance-style
  **week rail** on the left (group by WC, dates + cities), rate cards in the
  slide. Fee = show-rate×show-days + travel-rate×travel-days + per-diem; flows
  into the budget Salary section (now that migration 208 lets it persist).
- **Requirement: full feature parity with Adam's Google Sheet payroll** — before
  building, map the sheet's columns/derivations (a Stage-A-style pass) so nothing
  is dropped. Plus the OPS-17 fee-math fix (show-vs-travel split) lands here.
- **Export** (see shared tool below).

## Channel list — grid variant + custom columns + export
- Canonical grid, input-list columns (# · source · mic/DI · stand · 48V · notes),
  grouped by stage area (Drums / Bass & gtr / Vocals). Custom columns (pad,
  phase, stage box) via the grid's existing add-column. Reorder + export free.
- Use the data already in the live channel list; map its real schema first.

## Shared EXPORT tool (high-value, build once — used by every grid surface + Daysheets)
Adam: the Daysheets export tool is the benchmark — replicate as much as possible.
- Opens in a **pop-out** (new window/large modal), live preview of the output.
- Customisation knobs: **logo image**, **header image/banner**, **column order +
  show/hide**, **font size**, **highlighted rows/lines**, section ordering, page
  setup (size/orientation/margins).
- Output: print-ready **PDF** (and/or print dialog). Per-surface presets
  (rooming list, channel list, payroll sheet, budget).
- Architecture: a single `<GridExport>` module the canonical grid exposes, fed
  the grid's columns + rows + grouping; each surface supplies a preset. Build it
  once on Budget/Channel-list, reuse everywhere.
- TODO before building: get the Daysheets export specifics from Adam (a
  screenshot/walkthrough of its options) to scope the knobs precisely.

## Sequence (recommended)
Finish Budget Expenses (finalise prompt) → **Payroll** (real; quick, reuses
everything) → **Rooming** (after Adam confirms the workflow; 3 views) →
**Channel list** (mechanical) → **shared Export** folded in alongside whichever
surface needs it first (likely Channel list / Rooming, which are the most
export-driven). Each surface: map its real schema first (Stage-A discipline),
build, Chrome-verify, smoke.
