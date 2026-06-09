# Canonical Grid smoke tests

> **Last bulk verification**: 2026-06-08 (Adam, `/grid-demo` on
> `feat/personnel-unify` preview) — first smoke of Phase 1 core + Phase 2
> slide. Results logged below; fixes handed to CC in
> `docs/handover/CC_GRID_FIXPASS_2.md`.
>
> **Phase 1 fails:** GRID-03/04/05 (active ring missing — range tint shows, no
> ring), GRID-13/19/20 (no insertion line on row/section drag; row + section
> reorder **snap**, no FLIP — columns DO animate), GRID-16/18/31 (modal primary
> button invisible + off-centre), GRID-23 (dropdown option colours not applied).
> Demo also mashes Expenses+Income columns (Quantity + Day Type both present).
>
> **Phase 2 fails:** SLIDE-03 (currency display confusing — typed source
> replaced by converted value, grid≠slide), SLIDE-02 (status set wrong),
> SLIDE-06 (doc rename doesn't propagate to a linked transaction), SLIDE-07 /
> settlement / projections (missing headers + currency symbols), SLIDE-12 (scan
> animation doesn't play), SLIDE-01 (Open affordance too faint). SLIDE-10/11/12
> settlement **untestable** in the demo (no income/Show row) — demo needs an
> Income view.
>
> **Phase 2 passes:** SLIDE-04 (locked est), SLIDE-05, SLIDE-08, SLIDE-13.

## Fix pass 3 — P0 root cause (the dead `--lp-orange` token)

Found by inspecting the **running** `/grid-demo` DOM (not a code-read — which
is why GRID-03/04/05 + the A4 insertion line survived two passes):
`var(--lp-orange)` was **never defined**. `globals.css` only defined the
Tailwind `@theme` name `--color-lp-orange: #FF4500`, so every grid value using
`var(--lp-orange)` (the active-cell ring `box-shadow`/`outline`, the drag
insertion line `background`, all `--gr-orange-*` glows, buttons) resolved to
**nothing** → transparent. Literal-hex orange (`#FF450021`) survived; that's
why the range tint showed but the ring didn't.

**Fix (one line, `globals.css :root`):** `--lp-orange: var(--color-lp-orange);`
(+ `--lp-orange-hover`/`--lp-orange-light` for the family). CLAUDE.md sanctions
`var(--lp-orange)` as THE token, so the defect was the missing definition.

**Verified in the built CSS** (live `getComputedStyle` probe is Adam's to run):
`--lp-orange:var(--color-lp-orange)` is emitted to `:root` and
`--color-lp-orange:#ff4500` — so `var(--lp-orange)` now resolves to `#FF4500`,
and `.cell.active{box-shadow:inset 0 0 0 2px var(--lp-orange);outline:2px solid
var(--lp-orange)}` will paint orange.

**Token audit** (every `--lp-<colour>` the grid uses, checked defined in
`globals.css`): `--lp-orange` ❌→ now aliased; `--lp-violet` ✓ (#8B5CF6),
`--lp-pink` ✓ (#EC4899), `--lp-grid-accent-1..5` ✓; semantics via
`--color-lp-success/error/info/warning` ✓; surface/border/text/radius/space/z
all ✓. **`--lp-orange` was the only dead one.**

→ **GRID-03/04/05 (ring) and GRID-13/19/20 (insertion line) are root-caused to
this; retest on the fresh build.**

### Refinements landed this pass
- **SLIDE-02** — slide status pill now colour-coded (`.lp-gso .pill.<status>`).
- **SLIDE-07** — `🔒` emoji → lucide `Lock` (token colour) + tighter spacing.
- **Hover affordance** — the `🔗 source → open` pill reveals "→ open" on hover
  (opacity/tint transition), no longer a permanently-open chip.
- **GRID-24** — grid fills its container; the `item` column flexes
  (`minmax(w, 1fr)`), numbers stay fixed + right-aligned.
- **Demo toggle** — proper token-clean segmented control.

### Deferred to a follow-up (called out)
- **Settlement visual polish** — computes correctly; bringing the
  layout/spacing/typography fully up to the playbox render is a separate pass.

## Fix pass 2 (post Phase 1+2 smoke — re-smoke these)

Build-green / tsc-0 / eslint-0, **not click-verified** (auth-gated locally —
code + build verified only). The first three were already correct in HEAD
(the smoke ran on a stale preview).

| Smoke ID | Status | Fix / finding |
|----------|--------|---------------|
| GRID-03/04/05 (active ring) | already fixed in HEAD (e5d33c8) — retest | solid token-orange `box-shadow` + `outline` (no color-mix); call sites pass `isActive` |
| GRID-16/18/31 (modal primary) | already fixed in HEAD — retest | inline orange + `.lp-grid-modal button.pri` / `.go`; stale preview |
| GRID-23 (dropdown colours) | already fixed in HEAD — retest | `GridMenu` applies `optColors` dot+text; `ddpill` recolours (Grid.tsx:1249); stale |
| GRID-19 (row FLIP) | **fixed** | FLIP selector now `.row[data-uid]` only; runner sets `animation:none` so `gr-rise` can't stomp the transform (Grid.tsx endReorder + FLIP runner) |
| GRID-20 (section FLIP) | **fixed** | selector `#gr-sections > .section[data-uid]` (was `[data-uid]` → also matched rows, double-transforming) |
| GRID-13/19/20 (insertion line) | verify | `DragOverlay` portals to `<body>` (above the `overflow:hidden` cards) at `--lp-z-tooltip`; `setIns` is called for the y-axis — no code defect found; retest on fresh build |
| SLIDE-01 (Open affordance) | **fixed** | `.openbtn` opacity 0.7→1, stronger orange tint (grid.css) |
| SLIDE-02 (status set) | already correct — retest | `STATUSES` = budgeted·paid·reconciled·refunded (gridModel.ts:15); slide uses it |
| SLIDE-03 (currency) | **fixed** | grid money cell + slide inputs both show the SOURCE figure in row.cur; conversion is a red ≈ note (Grid.tsx money cell; GridSlideOver MoneyBlock) |
| SLIDE-06 (doc rename) | **fixed** | `Doc.id`; txn stores the doc id and renders the doc's live name (`receiptLabel`) |
| SLIDE-07 + settlement (symbols/headers) | **fixed** | currency symbol on txn/rate/settlement amounts; expenses header row added |
| SLIDE-12 (scan animation) | verify | `gr-spin` keyframe + step interval present; flow correct — retest |
| (demo) Expenses/Income split | **done** | `/grid-demo` toggle; Income view (Day·Venue·Date·Cap·Deal·Guarantee·Settled·Docs) makes settlement reachable (set Day=Show → Open) |

## Phase 1 fix pass (re-smoke these)

Regressions reported on the first smoke, fixed — build-green / tsc-0 /
eslint-0, but **not yet click-verified** (auth-gated locally). Re-smoke:

| Reported | Smoke IDs | Fix |
|----------|-----------|-----|
| Selection invisible | GRID-03/04/05 | active ring + range tint now **inline-styled** (can't be hidden by any cascade) |
| L/R arrows scroll | GRID-03 | was downstream of the invisible ring — keydown already `preventDefault`s; the ring now shows the move |
| Modal primary button missing | GRID-16/18/31 | modal overlay raised above the toolbar popovers + popover closes on confirm + primary inline-styled |
| Checkbox won't toggle | GRID-25 | `.chk` now has a click handler (toggle + styled) |
| Dropdown menu not colour-coded | GRID-23 | menu items now carry their optColor dot + text colour |
| No insertion line (col + section) | GRID-13/19/20 | drag overlays are now **state-driven + portaled** (inline-styled); column line spans full grid height |
| Column reorder no animation | GRID-13 | columns now FLIP (header) like rows/sections |
| Section rename | GRID-21 | double-click the section name to rename |
| Item emoji sticks on clear | GRID-06/09 | icon only renders while the item text is non-empty |
| Hide/show jumps width | GRID-15 | `grid-template-columns` transitions |
| Search result jumps | GRID-34 | rows fade in on appearance |

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

## Slide-over (Phase 2 — `<GridSlideOver>`)

Build-green / tsc-0 / eslint-0, **not yet click-verified** (auth-gated
locally). Opens from the **Open** affordance on an Item cell (now present on
formula rows too) or a Receipts cell → "Open line ↗". Slides from the right;
Esc / backdrop / ✕ closes; menus + modals sit ABOVE the slide; all edits
write back to the grid row and are **undoable (⌘Z)**.

#### SLIDE-01 — Opens / closes
**Do**: Click **Open** on a Travel row; then press Esc, click the backdrop, and the ✕.
**Expect**: Panel slides in from the right; each of Esc / backdrop / ✕ slides it out.
**Last verified**:

#### SLIDE-02 — LINE variant
**Do**: Open a normal row.
**Expect**: Editable title; Estimate/Actual currency inputs; Variance stat; Vendor; Status pill; Linked-to; Transactions; Documents; Notes.
**Last verified**:

#### SLIDE-03 — Currency + FX (red)
**Do**: Open the EUR Hotel row (or change a line's currency via the pill); look at Estimate/Actual + the variance line.
**Expect**: A styled currency menu; non-USD shows the converted value **red** with a "from {sym}{amount}" / "≈ … in $" note + a demo-rate warning.
**Last verified**:

#### SLIDE-04 — Locked estimate
**Do**: Open a Salaries (Payroll) or Accommodation (Rooming) row, then a Commissions (formula) row.
**Expect**: Estimate is read-only with a 🔒; the header shows the "🔗 source → open" pill. (A Routing-derived line would NOT lock.)
**Last verified**:

#### SLIDE-05 — Linked-to (person / show)
**Do**: Click "Link to a person or show…", pick a category then a name; remove a chip with ✕.
**Expect**: Two-step styled menu (no native chrome); chip added/removed; undoable.
**Last verified**:

#### SLIDE-06 — Transactions + receipt
**Do**: Add a transaction; edit name/date/amount; click "＋ attach receipt" → pick an existing document OR "Upload new receipt".
**Expect**: Date picker works; "Upload new" creates a Document AND links it to the transaction (the 📎 shows the name).
**Last verified**:

#### SLIDE-07 — Documents
**Do**: "＋ Add" → pick a type (Receipt/Quote/Contract/Invoice/Other); rename; remove.
**Expect**: Styled type menu; the new doc's name input is auto-focused; rename + remove are undoable.
**Last verified**:

#### SLIDE-08 — PERSON rate card
**Do**: Open a Salaries row; "＋ Add rate" → pick a preset; edit a rate label/amount; remove one. "Open in Personnel".
**Expect**: Rate lines add/edit/remove (undoable); "Open in Personnel" is a stub link (later phase).
**Last verified**:

#### SLIDE-09 — HOTEL variant
**Do**: Open an Accommodation row.
**Expect**: Budget first, then Confirmation # / Nights / Contact; "Open in Rooming" + "Link to Advance" stubs.
**Last verified**:

#### SLIDE-10 — SETTLEMENT (set a row's Day to "Show" first)
**Do**: On any row set **Day → Show**, then Open it.
**Expect**: Ticket tiers (£price · sold → gross); deductions (comps, charity/ticket, facility/ticket, tax %, WH %, deposit) → net; expenses tagged **Show/Artist**; deal switch (Flat/Plus/Versus/Door + split%) → walkout → after-WH → balance due — **all recompute live**.
**Last verified**:

#### SLIDE-11 — Settlement deal math
**Do**: Toggle the deal pill through Flat → Plus → Versus → Door; edit the split %, guarantee, tiers, an Artist expense.
**Expect**: Walkout follows the deal formula; Artist costs reduce the balance, Show costs sit inside the deal; the summary updates each edit.
**Last verified**:

#### SLIDE-12 — Scan + memo viewer
**Do**: "⬆ Upload & scan deal memo" (watch the animated steps); then click a memo → "view ↗".
**Expect**: Scanner runs then fills deal/guarantee/cap + attaches a memo (no reload); the viewer shows the document left + advance info (transport/exclusivity/hospitality/notes) right.
**Last verified**:

#### SLIDE-13 — Undo covers slide edits
**Do**: Make several slide edits, close, press ⌘Z in the grid.
**Expect**: Each edit reverts (the slide writes to the same model + undo stack).
**Last verified**:

## Known broken (2026-06-08 smoke → fix pass in CC_GRID_FIXPASS_2.md)

- **GRID-03/04/05 + A4 (insertion line)** — ROOT CAUSE FOUND (live DOM,
  2026-06-08): the grid references **`var(--lp-orange)`**, which is **undefined**
  — globals.css defines `--color-lp-orange`, never `--lp-orange`. So the ring's
  box-shadow computes `none`, its outline is style-`none`, and the insertion
  line (geometry/z correct) paints transparent. `isActive` logic + overlay
  structure are both fine. Fix = alias `--lp-orange: var(--color-lp-orange)` in
  globals.css. See `docs/handover/CC_GRID_FIXPASS_3.md`. (Earlier guess —
  "focused cell not flagged active" — was wrong; the class applies, the token
  is dead.)
- **GRID-13/19/20** — no insertion line on row/section drag; row + section
  reorder **snap** (FLIP stomped: `.row` `gr-rise` mount animation overrides the
  inline transform; section FLIP selector may miss `.section` nodes).
- **GRID-16/18/31** — modal primary button invisible + off-centre.
- **GRID-23** — dropdown option colours not applied to menu/pill.
- **SLIDE-01** — Open affordance too faint.
- **SLIDE-02** — slide status set wrong (must be budgeted/paid/reconciled/refunded).
- **SLIDE-03** — currency display confusing (typed source replaced by converted
  value; grid ≠ slide; missing the red source note on instant convert).
- **SLIDE-06** — renaming a doc linked to a transaction doesn't update the
  transaction (transaction stores a name copy, not a doc-id reference).
- **SLIDE-07 / settlement / projections** — missing column headers + currency
  symbols; every monetary value must show its currency.
- **SLIDE-12** — deal-memo scan animation doesn't play.
- **SLIDE-10/11/12** — settlement untestable in the demo (no income/Show row);
  demo needs an Expenses/Income view toggle.

## Deferred to later phases

- Income column set + projections panel + live FX feed (Phase 3/4).
- "Open in Personnel / Rooming", "Link to Advance", source-pill open, and the
  link/person/show targets are demo stubs until the real surfaces are wired.
- Mounting `<Grid>` + `<GridSlideOver>` inside the real product surfaces.
