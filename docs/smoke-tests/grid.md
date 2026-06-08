# Canonical Grid smoke tests

> **Last bulk verification**: _pending — Phase 1 not yet smoked by Adam._

The one `<Grid>` every tabular surface will use (Expenses · Income ·
Payroll · Rooming · Channel list). Phase 1 = the spreadsheet core against
static data at **`/grid-demo`** (no backend, no slide-over). Reference
behaviour: `docs/prototypes/grid-playbox.html` + `docs/prototypes/GRID_SPEC.md`.
Format defined in `docs/smoke-tests/README.md`. Prefix `GRID`; IDs never recycled.

## Loads & look

#### GRID-01 — Demo route renders
**Do**: Open `/grid-demo`.
**Expect**: A raised grid panel; each section is its own card with a stable
dot accent (orange / blue / violet / green / pink). Derived sections
(Accommodation, Salaries) are blue-tinted with a 🔗 source badge; the
Commissions section is violet-tinted with a "formula" badge.
**Last verified**:

#### GRID-02 — Both themes are token-clean
**Do**: Toggle the app light/dark theme on `/grid-demo`.
**Expect**: Every colour adapts (no stuck-dark / stuck-light patches) — the
grid uses only `var(--lp-…)` tokens.
**Last verified**:

## Keyboard + selection

#### GRID-03 — Arrow navigation
**Do**: Click a cell, press ↑↓←→.
**Expect**: The active cell (orange ring) moves one cell per press and scrolls into view.
**Last verified**:

#### GRID-04 — Shift extends a range
**Do**: From an active cell, hold Shift and press arrows / Shift-click another cell.
**Expect**: A rectangular range highlights (tinted) between anchor and focus.
**Last verified**:

#### GRID-05 — Drag-select a block
**Do**: Press and drag across cells.
**Expect**: A block selects; no browser text-selection appears.
**Last verified**:

#### GRID-06 — Type-to-edit
**Do**: On a text/money/number cell, start typing a character.
**Expect**: The cell enters edit mode seeded with that character (cursor at end).
**Last verified**:

#### GRID-07 — Enter / Tab / Esc commit (no double-fire)
**Do**: Edit a cell, press Enter (then edit another and press Tab, another and Esc).
**Expect**: Enter commits + moves **down**; Tab commits + moves **right**; Esc
cancels. The keystroke does **not** also navigate twice (no double-fire).
**Last verified**:

#### GRID-08 — Copy / paste a block
**Do**: Select a block, ⌘C, move the active cell, ⌘V.
**Expect**: The block pastes from the new top-left; money/number cells coerce to numbers.
**Last verified**:

#### GRID-09 — Clear selection
**Do**: Select cells, press ⌫ / Delete.
**Expect**: Cleared per type — money/number → 0, status → budgeted, check → off, text → empty.
**Last verified**:

#### GRID-10 — Undo / redo
**Do**: Make several edits, ⌘Z repeatedly, then ⌘⇧Z.
**Expect**: Each ⌘Z reverts one change (data, columns, widths); ⌘⇧Z replays. Not undoable mid-edit.
**Last verified**:

## Columns

#### GRID-11 — Resize with ghost + clamp
**Do**: Hover a column's right edge, drag the handle.
**Expect**: An orange ghost line tracks the pointer; the column resizes live and clamps at its `min` (can't collapse to zero).
**Last verified**:

#### GRID-12 — Reset widths
**Do**: Resize a few columns, click **⇄ Reset widths**.
**Expect**: All columns return to their default widths.
**Last verified**:

#### GRID-13 — Column reorder
**Do**: Drag a column header sideways past another.
**Expect**: An orange vertical insertion line shows the drop; on release the column moves there (no native-DnD glow bug).
**Last verified**:

#### GRID-14 — Rename column
**Do**: Double-click a column header, type a new name, Enter.
**Expect**: The header label updates (undoable).
**Last verified**:

#### GRID-15 — Hide / show columns
**Do**: Click **▦ Columns**, toggle a column's checkbox.
**Expect**: The column hides/shows immediately; the popover is styled (not native).
**Last verified**:

#### GRID-16 — Add custom column (text / number / checkbox / dropdown)
**Do**: ▦ Columns → ＋ Add custom column → pick a type → Add column.
**Expect**: A new column appears with seeded empty values; dropdown options get rotating colours.
**Last verified**:

#### GRID-17 — Add number Formula column
**Do**: Add a Number column, tick "Make it a formula", pick `Actual − Estimate`.
**Expect**: The column shows the computed result per row.
**Last verified**:

#### GRID-18 — Delete custom column (confirm)
**Do**: ▦ Columns → ✕ on a custom column → confirm.
**Expect**: A confirm dialog appears; on confirm the column + its data are removed (undoable with ⌘Z).
**Last verified**:

## Rows + sections

#### GRID-19 — Row reorder (FLIP)
**Do**: Drag a row's `#` handle up/down.
**Expect**: A horizontal insertion line shows the drop; rows animate (FLIP) into place; the `#` counter stays sequential.
**Last verified**:

#### GRID-20 — Section reorder (FLIP)
**Do**: Drag a section header up/down.
**Expect**: Sections animate to the new order (FLIP); accents follow their section, not the position.
**Last verified**:

#### GRID-21 — Add section / add line
**Do**: Click **＋ Add section**; in a normal section click **＋ Add line**.
**Expect**: A new section / blank line appears (undoable).
**Last verified**:

## Cell types

#### GRID-22 — Status menu (styled, ticked)
**Do**: Click a Status pill (or press Enter on it).
**Expect**: A styled menu anchored to the pill; the current value is ✓-ticked; picking re-colours the pill.
**Last verified**:

#### GRID-23 — Dropdown menu with option colours
**Do**: Click the Category pill.
**Expect**: A styled menu; options apply their colours to the pill.
**Last verified**:

#### GRID-24 — Day-type add / delete
**Do**: Click the **Day** pill → ＋ Add day type (name it) → reopen → ✕ on the added type.
**Expect**: The custom day type is added and selectable; its ✕ removes it (built-in types have no ✕).
**Last verified**:

#### GRID-25 — Checkbox cell
**Do**: Click a Paid? checkbox (or Enter on it).
**Expect**: Toggles on/off (orange when on); undoable.
**Last verified**:

#### GRID-26 — Money FX conversion
**Do**: Look at the EUR (Hotel) and GBP (Guitar Tech) rows.
**Expect**: Their money cells render **red** (converted to the display currency) with a source-currency tag.
**Last verified**:

#### GRID-27 — Variance + calc + formula columns
**Do**: Edit an Actual so it differs from Estimate.
**Expect**: Variance shows an arrow + %; **Qty × Act** (calc) and **Act − Est** (formula) columns recompute live.
**Last verified**:

#### GRID-28 — Receipts cell
**Do**: Click a 📎 Receipts cell on a row with documents/transactions.
**Expect**: A styled menu lists the line's documents + transaction receipts, plus "Open line ↗".
**Last verified**:

#### GRID-29 — Memo (doc) cell
**Do**: Click a Memo cell → ＋ Add memo.
**Expect**: A memo is added to the line (count increments).
**Last verified**:

## Section kinds

#### GRID-30 — Derived est is locked
**Do**: Try to edit the **Estimate** of an Accommodation / Salaries row.
**Expect**: A "Pulled from Rooming/Payroll" warning appears; the cell shows a 🔒; Actual stays editable.
**Last verified**:

#### GRID-31 — Formula section interactions
**Do**: In Commissions: click a `%` chip and change it; click "of Gross/Net" to toggle; click the Estimate to switch to a fixed value (confirm); click the amber "custom value" chip to restore (confirm).
**Expect**: The estimate recomputes from gross/net × %; switch-to-fixed and restore each show a confirm dialog.
**Last verified**:

## Display

#### GRID-32 — Density
**Do**: Click the Compact / Comfortable / Spacious buttons.
**Expect**: Row height + text size change (driven by the app density tokens).
**Last verified**:

#### GRID-33 — Group by status
**Do**: Click the **Group · Section** chip to switch to Status.
**Expect**: Rows regroup into status sections; toggling back restores section grouping.
**Last verified**:

#### GRID-34 — Search
**Do**: Type in the search box.
**Expect**: Rows filter by item / vendor (case-insensitive); counts update.
**Last verified**:

#### GRID-35 — Filter by status
**Do**: Click **⚲ Filter**, untick a status.
**Expect**: Rows of that status hide; the popover is styled (not native).
**Last verified**:

## Known broken

_None recorded yet — Phase 1 awaits its first smoke._

## Deferred to later phases (not in Phase 1)

- Slide-over (Line / Person / Hotel / Settlement) — `onOpenRow` is wired but
  unbound in the demo.
- Income column set + deal/settlement, projections panel, live FX feed.
- Mounting `<Grid>` inside the real product surfaces.
