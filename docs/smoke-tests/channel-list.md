# Channel list smoke tests

> **Last bulk verification**: 2026-06-02 (Adam, local dev)

Per `docs/smoke-tests/README.md`. Walk these on Vercel preview after
every non-trivial channel-list change. ID prefix is `CHL`.

Active fix sprint: `docs/handover/CC_CHANNEL_LIST_REBUILD.md`
(addresses the items currently under "Known broken" + several
enhancements observed during the first smoke run).

## Editing — input grid

#### CHL-01 — Add new channel affordance

**Do**: Open any tour with a channel list (`/operations/[tourId]/channel-list`).
Look for "+ Add channel" or equivalent button at the bottom of the input grid.

**Expect**: Button visible. Click creates a new input row, cursor focuses
the Name cell. Type, blur → saves silently.

**Last verified**: 2026-06-02 ✅

#### CHL-03 — Full keyboard tab navigation, output grid

**Do**: Click cell row 1 column 1 in the output sub-grid (PSM1000, IEM, etc.).
Hold Tab through every cell to the bottom-right.

**Expect**: Every cell receives focus in order. Tab from end of row 1
wraps to start of row 2.

**Last verified**: 2026-06-02 ✅

#### CHL-04 — Shift+Tab reverse navigation

**Do**: Position cursor mid-grid. Hold Shift+Tab back to row 1 col 1.

**Expect**: Reverse order works identically. No focus drops.

**Last verified**: 2026-06-02 ✅

#### CHL-05 — Sticky channel number column on horizontal scroll

**Do**: Open channel list. Horizontal scroll the grid right.

**Expect**: Column 1 (channel #) stays pinned at left. Other columns
scroll under it.

**Last verified**: 2026-06-02 ✅

#### CHL-08 — Mic stand inventory auto-aggregates

**Do**: Add input rows with different stand types in the `stand` column.

**Expect**: Mic stands aggregate counts each stand type.

**Last verified**: 2026-06-02 ✅

#### CHL-19 — Channel list saves persist across page reload

**Do**: Edit an input row name. Wait 2 seconds (debounce). Reload page.

**Expect**: Edit is still there.

**Last verified**: 2026-06-02 ✅

## Cross-product links

#### CHL-16 — Empty-state link from operations channel list → riders

**Do**: From `/operations/[tourId]/channel-list`, when there's no
channel list section yet, find the "Open riders →" link in the empty
state.

**Expect**: Link goes to `/operations/[tourId]/riders`.

**Last verified**: 2026-06-02 ✅

#### CHL-17 — Header link from channel list → stage plot

**Do**: From `/operations/[tourId]/channel-list`, find the
"Open stage plot →" button in the header.

**Expect**: Link goes to `/operations/[tourId]/stage-plot`.

**Last verified**: 2026-06-02 ✅

#### CHL-18 — Resolve pack error visible

**Do**: If your tour's rider pack has a resolve error, open the channel
list page.

**Expect**: Amber banner at top reads "Rider pack resolve issue:
\<message\>". Not silent.

**Last verified**: 2026-06-02 ✅

## Stage box patching (existing list-based UI)

#### CHL-11 — Stage box patch matrix save

**Do**: In the patch UI, select channels for ports 1–4. Click Save.

**Expect**: Grid Input column updates: those four input rows show Stage
Box A and ports 1–4.

**Last verified**: 2026-06-02 ✅

#### CHL-12 — Stage box patch matrix re-open persistence

**Do**: Re-open the patch UI for the same box.

**Expect**: Ports 1–4 still show the previously-assigned channels.
Change one. Save. Re-open. Change persists.

**Last verified**: 2026-06-02 ✅

#### CHL-13 — Stage box patch matrix Cancel

**Do**: Open the patch UI, change a few port assignments, click Cancel
(not Save).

**Expect**: No changes persist. Grid Input column unchanged.

**Last verified**: 2026-06-02 ✅

#### CHL-14 — Stage box unassign via "— unused —"

**Do**: Open patch UI for a box with some ports assigned. Set one
assigned port to "— unused —". Save.

**Expect**: That input row's stage box assignment is cleared. Reopen
UI — port is empty.

**Last verified**: 2026-06-02 ✅

#### CHL-15 — Stage box port doesn't allow double-assignment

**Do**: Open patch UI. Try to assign the same channel to two different
ports.

**Expect**: Once a channel is picked for one port, it disappears from
other ports' dropdowns (or shows as already assigned).

**Last verified**: 2026-06-02 ✅

## Known broken

Tests that currently fail or are partially working. Move OUT of this
section as the channel-list rebuild sprint closes gaps.

#### CHL-02 — Full keyboard tab navigation, input grid

**Do**: Click cell row 1 column 1 in the input grid. Hold Tab through
every cell to the bottom-right.

**Expect**: Every cell receives focus in left-to-right, top-to-bottom
order. No focus drops. The focused cell shows a clear inset orange ring.

**Root cause (corrected)**: Every cell was *already* wrapped in
`<NavCell>` (since Sprint 12 §8b2 / `71b2327`) and Tab *did* land on
each cell. The real defect was an **invisible focus ring**:
`BrandedSelect` (Position / Cable / Mic / Stand / Provider) used
`ring-[var(--lp-orange)]/20` — but the bare token `--lp-orange` is
**undefined** in `globals.css` (only `--color-lp-orange` exists), so
the `color-mix()` resolved to an invalid colour and no ring rendered.
`PositionPicker` (Stage Box / Loom) had only a faint border nudge; the
phantom button had no focus style. Focus *looked* like it skipped those
cells.

**Fix applied (2026-06-03, §CL-FIX-1)**: inset full-opacity
`focus-visible:ring-2 ring-inset ring-[var(--color-lp-orange)]` on
the `BrandedSelect` trigger, `PositionPicker` trigger, and the phantom
button. (App-wide side effect: every `BrandedSelect` mount now has a
visible keyboard-focus ring — previously all were invisible.)

**Status**: ⏳ Pending Vercel-preview verification. Move out of
"Known broken" once the tab walk is confirmed.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-1.

#### CHL-06 — Section headers between input / output / aggregates

**Do**: Scroll vertically through the editor.

**Expect**: Visible, polished section dividers between input rows,
output rows, and the inventory aggregates blocks.

**Currently**: Section dividers exist functionally but the visual
treatment is weak. Needs UI/UX pass to match the Advance glass-hero /
sticky section pattern.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-5.

#### CHL-07 — Mic / DI inventory auto-aggregates (multiple issues)

**Do**: Add a few input rows with different mics. Open a mic
dropdown.

**Expect (full)**:
1. Aggregate auto-recomputes per selection.
2. Dropdown is wide enough to read full mic names — no clipping.
3. Dropdown is type-searchable (combobox, not native select).
4. If the mic isn't in the inventory, an "+ Add this mic" inline option
   prompts for name / provider / phantom default and inserts to
   `mic_library`.
5. Phantom (48V) is a binary toggle (on / off). No third state.

**Currently**:
- (1) ✅ aggregates do recompute correctly.
- (2) ⏳ FIXED §CL-FIX-2 (pending Vercel verify) — Mic/DI is now a
  downshift combobox whose menu portals to `<body>`, escaping the
  channel grid's `overflow-auto` clip (the real cause of "clipping");
  menu sizes to the mic name (min 260px), not the cell width.
- (3) ⏳ FIXED §CL-FIX-2 (pending Vercel verify) — typing filters the
  list (case-insensitive substring on name). Arrow/Enter/Esc nav.
- (4) ⏳ FIXED §CL-FIX-2 (pending Vercel verify) — the last item is
  always "+ Add «typed» to library"; opens a modal that inserts into
  `mic_library` (workspace-scoped) and selects the new row.
  NOTE — modal field set is **Name / Type (5-way enum) / Default +48V**,
  matching the REAL mic_library schema (migration 040). The spec's
  "default provider" field is omitted: there is no provider column on
  mic_library (provider is captured per-channel), and `type` is a 5-way
  enum, not a mic/DI binary. Flagged for Adam.
- (5) ⏳ FIXED §CL-FIX-3 (pending Vercel verify + migration 113 apply) —
  the +48V cell is now a binary `role="switch"` toggle (orange-filled +
  white check = on, bordered + faint dot = off). Migration 113 backfills
  NULL→false and pins `phantom_power NOT NULL DEFAULT false`. The UI is
  null-safe pre-migration (legacy NULL renders off, first tap → on). Run
  the STEP 0 pre-check in `113_supabase.sql` before applying.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-2 (items 2–4) +
§CL-FIX-3 (item 5).

#### CHL-09 — Cables inventory auto-aggregates (enhancement needed)

**Do**: Add input rows with different cable lengths.

**Expect (basic)**: Cables aggregate counts each length. ✅ passes
today.

**Expect (enhancement)**:
- Adding a "hotshot" / talkback switch row auto-adds an extra cable
  to the inventory.
- User can add spare cables manually (not tied to a channel row).

**Currently**: Basic counting works. Enhancements not implemented.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-11.

#### CHL-10 — Stage box patch UI shape

**Do**: Click "Patch" next to a stage box. Open the patch UI.

**Expect**: Patch grid styled like a dLive / LV1 patch matrix — rows
are channels, columns are box ports, cells light up to show the
patch. Click a cell to toggle. Retain all current info (loom, cable
length, etc.) alongside the matrix.

**Currently**: UI is a vertical list of ports, one channel-dropdown per
port. Functional but doesn't read as a matrix.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-9.

#### CHL-21 — Column flexibility

**Do**: Open a channel list. Try to add or remove columns (e.g. enable
sub-snake column for one tour, disable mic-substitute for another).

**Expect**: Base channel list has only Number + Name columns. Every
other column is opt-in via an "Add column" picker. Removing a column
hides its cells AND its related action buttons (e.g. removing the
sub-snake column also hides the "Manage sub snakes" CTA).

**Currently**: All columns are always present. Sub-snake / stage box
/ mic / cable buttons are always visible regardless of whether you
use those columns.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-6.

#### CHL-22 — Output numbering independent from input numbering

**Do**: Add 16 input rows, then 4 output rows. Look at the output
row numbers.

**Expect**: Output rows are numbered 1, 2, 3, 4 (independent of input
count).

**Currently**: Output rows continue the input numbering — they show
17, 18, 19, 20. Shared `(section_id, row_index)` unique constraint on
`channel_list_rows`.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-7.

#### CHL-23 — Outputs "Mark as stereo"

**Do**: On any output row, click "Mark as stereo".

**Expect**: That row claims two output positions (e.g. 1+2). Visual
indicator that the row is a stereo pair. Patch matrix treats it as a
1×2 cell.

**Currently**: No stereo concept exists on outputs. Each output row
is single-position.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-7.

#### CHL-24 — Output column set

**Do**: Look at the columns available on output rows.

**Expect**: NAME, DESCRIPTION, STEREO?, POSITION, NOTES.

**Currently**: Output columns are: output_item, output_destination,
output_qty, output_notes (per migration 098). No STEREO. No
POSITION. DESCRIPTION lives under output_destination but the label
is mis-named for Adam's workflow.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-7.

#### CHL-25 — Output patch matrix

**Do**: After adding outputs and a stage box with outputs (e.g. snake
returns), open a patch view for outputs.

**Expect**: Matrix grid like the input patch — rows are output rows,
columns are box output ports. Click cell to assign.

**Currently**: No output patch matrix exists. Stage boxes track
`capacity` as a single number — needs split into `input_capacity` +
`output_capacity`.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-8.

#### CHL-26 — Patch entry point from stage box dropdown

**Do**: On any channel row, click the stage box dropdown. Look at the
options.

**Expect**: The dropdown lists stage boxes AND has an "Open patch
matrix…" action at the bottom that opens the patch UI for whichever
box is selected.

**Currently**: Stage box dropdown only assigns the box; patching is a
separate trip back to the aggregate section.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-10.

#### CHL-27 — Multi-add channels

**Do**: Click an "Add multiple channels" affordance.

**Expect**: Prompt asks how many input rows to insert. Inserts that
many rows at the end of the input grid in one batch, sequentially
numbered. Each row blank, ready to fill.

**Currently**: Only single-row "+ Add channel" exists. Bulk insert is
manual.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-4.

## Retired

#### CHL-20 — Tour-default currency applied to channel list cells

Retired 2026-06-02. Not relevant: channel-list cells don't have
currency-typed fields in Adam's workflow.
