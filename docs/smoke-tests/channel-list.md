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

**Currently**: ⏳ FIXED §CL-FIX-5a (pending Vercel verify) — Inputs /
Outputs / Inventory each now render a full-width section band: brand-
orange left edge accent + subtle orange tint + uppercase label + count
pill (`<ChannelListSectionBand>`). The glass-hero HEADER half (§CL-FIX-5b)
is DEFERRED: its spec target (`/operations/[tourId]/channel-list`) is a
Phase-4 placeholder, and the live editor renders inside `PackEditor`
(rider-pack route). True viewport-sticky bands also deferred to Phase 4
(host scroll container not yet defined).

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-5 (5a done; 5b/header
deferred to Phase 4).

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

**Currently**: ⏳ FIXED §CL-FIX-6 (pending Vercel verify) — base list is
Number + Name; all other columns opt-in. A "Columns" picker (top toolbar)
toggles each optional column (Position, Stage Box, Loom, Cable, Mic/DI,
Stand, +48, Provider, Notes). Each optional column header has a hover "×"
that soft-hides it (row data kept — re-enable restores it). Enabled set
persists to `rider_sections.metadata.enabled_columns`; existing tours
lazily derive their set from row data so they look unchanged. The
"Manage sub-snakes" / "Manage stage I/O" buttons only show when their
columns are enabled. NOTE: `mic_substitute` dropped per Adam; the
"Add column at right of header row" was placed in the toolbar instead
(the grid header is a fixed-track CSS grid).

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-6 (6a render + 6b picker).

#### CHL-22 — Output numbering independent from input numbering

**Do**: Add 16 input rows, then 4 output rows. Look at the output
row numbers.

**Expect**: Output rows are numbered 1, 2, 3, 4 (independent of input
count).

**Currently**: ⏳ FIXED §CL-FIX-7 (pending Vercel verify + migration 115
apply) — outputs number from 1 independently. Migration 115 drops the
shared `(section_id, row_index)` constraint, adds UNIQUE
`(section_id, row_kind, row_index)`, and renumbers existing outputs per
section. appendRow / appendOutputRow now scope their max by row_kind.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-7.

#### CHL-23 — Outputs "Mark as stereo"

**Do**: On any output row, click "Mark as stereo".

**Expect**: That row claims two output positions (e.g. 1+2). Visual
indicator that the row is a stereo pair. Patch matrix treats it as a
1×2 cell.

**Currently**: ⏳ FIXED §CL-FIX-7 (pending Vercel verify + migration 115)
— each output row has a STEREO? binary toggle (output_is_stereo). When
on, the # column and POSITION placeholder show the pair "N+(N+1)";
POSITION is overridable free text. (Single-row + boolean model per Adam.)

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-7.

#### CHL-24 — Output column set

**Do**: Look at the columns available on output rows.

**Expect**: NAME, DESCRIPTION, STEREO?, POSITION, NOTES.

**Currently**: ⏳ FIXED §CL-FIX-7 (pending Vercel verify + migration 115)
— output grid is now # | NAME | DESCRIPTION | STEREO? | POSITION | NOTES.
DESCRIPTION = new `output_description` (backfilled from
`output_destination`, kept one tour before any drop). QTY removed from
the UI (`output_qty` retained in DB).

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

**Currently**: ⏳ FIXED §CL-FIX-4 (pending Vercel verify) — an
"+ Add many…" button (list-plus icon) sits beside "+ Add channel". It
opens a count modal (default 8, clamp 1–64); submitting inserts that many
blank input rows in ONE round-trip (`ch.appendRows` array insert),
numbered sequentially after the current max input `row_index`.

#### CHL-28 — Override opens the channel-list editor, not a dead page (A#8)

**Do**: On an inherited / artist-scope channel list shown in the tour
channel-list tab, click **Override**.

**Expect**: navigates to `/operations/[tourId]/riders/[packId]`, which for a
`kind === 'channel_list'` pack renders the channel-list editor (RiderPackEditorView
mounts `PackEditor` → `ChannelListEditor`) — a working editable grid, NOT the
generic rider shell with no channel-list section. **Note**: the grade's "dead end"
premise was already obsolete (kind-aware routing lives in RiderPackEditorView); this
just points the override at the canonical `/operations` URL directly instead of the
legacy `/tours/[id]/rider-packs` path that only resolved via a 301 redirect.
**Code-verified**; needs-live to confirm the destination grid.

**Tracked in**: `CC_CHANNEL_LIST_REBUILD.md` §CL-FIX-4.

## Stage B — RE-SKIN ONLY (Option A) + arrow-key nav — 2026-06-10

> Purely visual + arrow-key nav. Inventory + decisions:
> `docs/handover/CHANNEL_LIST_MAP.md` (D1–D6). `tsc` 0 · `eslint` 0 · `next
> build --webpack` green. ID prefix `CL-RS`.

**The ENTIRE Stage-B diff (3 files — name-checked per the hard rule):**
1. `src/lib/hooks/useCellNav.tsx` — **added** arrow-key nav in `NavCell` keydown
   (↑/↓ rows, ←/→ cells **only at the caret edge**; scoped to text cells so the
   smart selects keep their own ↑↓ option-nav). Nothing else changed.
2. `src/components/rider-pack/channel-list-cells/ChannelListSectionBand.tsx` —
   tokenised (`--color-lp-orange`→`--lp-orange`; surface→`--lp-panel`). Structure
   unchanged (D3: keep the 3 blocks, no left gutter).
3. `src/components/rider-pack/ChannelListEditor.tsx` — **one line**: outer
   container `--lp-surface`→`--lp-panel` + `shadow-sm` (raised panel).

**Untouched (zero changes):** 11 columns + picker + lazy backfill · 10 smart
cells · drag-reorder · Outputs sub-grid · 5 counters + StageBoxPatch ·
stage-plot link · templates · advance · export · data model / RowPatch / RPCs.

- **CL-RS-01** (code-verified) raised panel + tokenised bands; Adam confirms
  visual parity vs the budget `<Grid>`.
- **CL-RS-02** (code-verified, needs-live) arrow-key nav: ↑/↓ rows, ←/→ at caret
  edge; mid-text editing + selects' own ↑↓ unaffected.
- **CL-RS-03..10** (needs-live) every preserved feature (columns/picker, mic
  search + +48 flash, stage-box/sub-snake pickers + Manage + Patch, cable/stand/
  position/provider/notes, outputs stereo+numbering, the 5 counters, drag-
  reorder, the stage-plot link, templates/advance/export) renders + works
  exactly as before. (Full detail: CHANNEL_LIST_MAP.md §1–7.)

## Retired

#### CHL-20 — Tour-default currency applied to channel list cells

Retired 2026-06-02. Not relevant: channel-list cells don't have
currency-typed fields in Adam's workflow.

## Create path (B1)

- **CHAN-01** (needs-live) On a tour whose rider pack has no channel-list
  section, the Channel-list tab shows "+ Create channel list". Clicking it POSTs
  a `channel_list` section to the tour's most-recent rider pack (16 blank rows
  seeded) and refreshes into the editable editor; the list also appears in the
  rider pack. If the tour has NO rider pack, the tab prompts to create one under
  Riders instead. (`ChannelListEmptyState` → POST /api/rider-packs/[id]/sections)

## Patch matrix — G2-2 (graded design, replaces the strip board) — 2026-07-18

The vertical socket-strip board (`ChannelPatchBoard`) is retired. Patch mode now
opens `PatchMatrix`: channels DOWN the left, sockets ACROSS the top grouped by
stage box / sub-snake (box-coloured group headers). Writes are unchanged — one
`onPatch(channelId, SocketPatch)` per assignment, socket-family columns only,
`row_index` NEVER touched.

#### PM-01 — Matrix shape
**Do**: With ≥1 stage box (or sub-snake) and some channels, click **Patch**.
**Expect**: a matrix — channel rows (left, "N. name", frozen), socket columns
(top, grouped under a coloured box/snake header, position labels A1…A16), a dot
in each patched cell. Horizontal + vertical scroll; header + channel column stay
put. **Needs-live**.

#### PM-02 — Click assigns, CLICK AGAIN UNASSIGNS (toggle)
**Do**: Click an empty cell (channel × socket). Click the same cell again.
**Expect**: first click patches the channel to that socket (orange dot); second
click unpatches it (empty). Assigning also clears the channel's previous socket
(a channel is only ever in one place). **Needs-live**.

#### PM-03 — Drag a diagonal patches a run
**Do**: Press a cell and drag down-right across several rows/cols; release.
**Expect**: a live orange preview along the diagonal while dragging; on release,
a sequential run is patched (chan N→sock X, N+1→X+1, …). A pure horizontal or
vertical drag patches only the anchor (the gesture is diagonal by design).
**Needs-live**.

#### PM-04 — Conflict shows red
**Do**: Patch two different channels into the SAME socket column.
**Expect**: both cells in that socket column render red (conflict), not orange.
Resolving one (unpatch / move) clears the red. **Needs-live**.

#### PM-05 — Crosshair + keyboard
**Do**: Hover a cell; then focus the matrix and use arrows + Enter.
**Expect**: hovering tints the whole row + column (crosshair). Arrows move a
cursor cell (orange ring); Enter toggles the cursor's channel/socket. **Needs-live**.

#### PM-06 — Toolbar: Patch in order · Clear patch · Boxes filter
**Do**: Click **Patch in order**; then **Clear patch** (confirm); toggle a box
chip under **Boxes**.
**Expect**: Patch-in-order fills empty sockets sequentially from unpatched
channels. Clear patch asks to confirm, then returns every channel to unpatched
(numbers/names untouched). A Boxes chip hides/shows that box's socket columns.
**Needs-live**.

## Patch matrix — quality pass + single surface (G2-2b) — 2026-07-19

#### PM-07 — Patch matrix quality pass
**Do**: Open Patch mode on a wide screen. Inspect the grid.
**Expect** (per CC_G2_BUILD.md §G2-2b F): equal-width socket columns (`table-layout:
fixed` + `<colgroup>`), 40px sockets, hairline gridlines (`--lp-border-subtle`, not
heavy borders), painted cells as inset TILES (3px radius) not flat blocks, empty
cells a barely-lifted field, box/snake group headers TRUNCATE with a title tooltip,
crosshair row/col tint on hover, sticky left channel column casts a right-edge shadow
on horizontal scroll, 2px orange inset cursor ring, conflict = red tile. **Needs-live**.

#### PM-08 — One patch surface (StageBoxPatchModal retired)
**Do**: In the channel list's Inventory → Stage boxes, click a box's **Patch** button.
**Expect**: it opens the MAIN patch matrix (patch mode) pre-filtered to that box via
the Boxes filter (other boxes hidden but toggleable back on) — NOT the old socket-strip
modal. The old `StageBoxPatchModal` is deleted; there is no second patch UI with old
styling anywhere. Leaving patch mode clears the box focus. **Needs-live**.
