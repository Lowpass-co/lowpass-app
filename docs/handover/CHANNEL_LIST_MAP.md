# CHANNEL_LIST_MAP — Stage A (preservation inventory, no code)

> Channel list is a mature, feature-dense rider-pack surface. Stage B is a
> **RE-SKIN ONLY (Option A)** — canonical grid look + tokens + section gutter +
> keyboard-nav parity, dropping/rebuilding/simplifying **nothing**. This doc is
> the preservation checklist: every item below is confirmed to exist, with its
> file + wiring, and **must survive Stage B unchanged in behaviour**.
>
> **Status:** Stage A. Awaiting review + D1–D6 before any Stage B code.

---

## 0. The two surfaces (scope decision — D1)

- **The EDITOR** — `src/components/rider-pack/ChannelListEditor.tsx` (1168 lines).
  The feature-dense, editable surface. **This is the re-skin target.** Mounted
  via `PackEditor` from
  `src/app/(app)/tours/[id]/rider-packs/[packId]/page.tsx`.
- **The read-only tour sheet** — `src/components/channel-list/ChannelListTourSheet.tsx`,
  mounted at `src/app/(app)/operations/[tourId]/channel-list/page.tsx`. Already a
  read-only `<SpreadsheetGrid>` display. **D1: is this in scope, or editor-only?**

The editor is a bespoke CSS-grid (dynamic `gridTemplateColumns` from the enabled
columns) with per-cell smart components, NOT `<SpreadsheetGrid>`/`<Grid>`. The
re-skin restyles it in place; it does **not** port it to another grid component
(the hard rule: keep the smart cells, restyle them).

---

## 1. Data model — STABLE, no migration (preserve column names/ids/linkage)

- `rider_sections` (034) + `section_type` enum `fields|channel_list` (040/042) +
  `metadata` JSONB. For channel lists, `metadata` holds **`enabled_columns`**
  (string[]) + `inventory_notes`. `sort_order`, `title`, `fields`.
- `channel_list_rows` (040, extended 043/046/098/113/115):
  `id, pack_id, section_id, row_index, channel_name, sub_snake_id,
  sub_snake_position, stage_box_id, stage_box_position, position, gear_id, mic,
  mic_substitute, di, stand, phantom_power (NOT NULL bool since 113), provider
  (band|venue|hire|null), notes, row_kind (input|output, 098), output_item,
  output_destination, output_qty, output_notes, output_description (115),
  output_is_stereo (115), output_position (115), cable_length (098)`.
  - **046** dropped the old `stage_box` text + `stage_io_id` → `stage_box_id` FK.
  - **115** dropped `UNIQUE(section_id,row_index)` → `UNIQUE(section_id,row_kind,
    row_index)` (independent input/output numbering). **Don't change this.**
- `sub_snakes` (040 + `capacity` 046): `id, pack_id, section_id, label, colour,
  capacity (def 8), position`.
- `stage_boxes` (046, migrated from `section_stage_io`): `…, capacity (def 16),
  …` — **id preserved from section_stage_io**; don't reshape.
- `mic_library` (040): `id, workspace_id(nullable=global seed), name, type
  (dynamic|condenser|ribbon|di_active|di_passive), default_phantom`. 12 global
  seeds.
- `stage_plots` / `stage_plot_items` (109): `stage_plot_items.channel_list_row_id
  → channel_list_rows(id) ON DELETE SET NULL` — **the stage-plot ↔ channel-list
  link** (see §6).
- TS types: `src/lib/rider-packs/types.ts` (`ChannelListRow` L217–260, `SubSnake`,
  `StageBox`, `MicLibraryEntry`), `src/lib/types/stage-plot.ts`.

> The re-skin touches **no SQL, no column, no id, no FK**. Pure UI.

---

## 2. Columns (`src/lib/channel-list/columns.ts`) — preserve every one

`CHANNEL_LIST_COLUMNS` (L60–72):
- **Permanent:** `number` (#, 32px, display-only) · `name` (focusable).
- **Opt-in:** `position` (Pos) · `stage_box` (Stage Box, gates *Manage stage
  boxes*) · `sub_snake` (Loom, gates *Manage sub-snakes*) · `cable_length`
  (Cable, gates *cables-inventory*) · `mic` (Mic/DI, gates *manage-mic-library*)
  · `stand` · `phantom_power` (+48) · `provider` (Prov) · `notes`.
- Enabled set persisted in `rider_sections.metadata.enabled_columns`;
  `getEnabledColumnKeys(metadata, rows)` (L119–128) reads persisted or **lazily
  backfills** from data (`deriveEnabledColumns`). `enabledOptionalKeys` persists
  back. Picker = `ColumnPickerPopover` (channel-list-cells/), toggling →
  `metadata.enabled_columns` + `onStructureChange()` refetch.
- **§CL-FIX-6 confirmed:** `mic_substitute` is NOT a column. But the **field
  still exists** on the row + RowPatch — don't drop it; just don't surface it as
  a column.

---

## 3. Smart cells — KEEP each component, only restyle

| Feature | File | Notes (must survive) |
|---|---|---|
| Mic/DI combobox | `channel-list-cells/MicDiSelectCell.tsx` | Downshift type-to-search over `mic_library`, KIND badges (DYN/CON/RIB/DI+/DI), **portals to body** (escapes overflow), "+ Add «typed»" row → `AddMicModal`; on pick fires `onPick(entry)` so parent **auto-flashes +48** from `entry.default_phantom` (§CL-FIX-6) |
| Add-mic modal | `channel-list-cells/AddMicModal.tsx` | name + 5-way type, phantom auto from condenser/di_active; `createMic()` workspace-scoped |
| Stage-box picker | `rider-pack/PositionPicker.tsx` | per-port occupancy grid 1..capacity, occupant display, Clear, **Manage stage boxes** (`StageBoxDialog`) |
| Loom/sub-snake picker | `rider-pack/PositionPicker.tsx` (same) | capacity-8 default; **Manage sub-snakes** (`SubSnakeDialog`) |
| Cable length | `channel-list-cells/CableLengthSelectCell.tsx` | options `—/6'/10'/15'/25'/50'/100'/150'/300'` (TEXT round-trip; feeds the Cables counter). **NO "hot shot" exists** — see D2 |
| Phantom +48 | inline in `ChannelListEditor` ChannelBlock (~L1050) | `role="switch"`, orange when true, **700ms flash** on mic-driven autofill |
| Provider | inline BrandedSelect (~L1088) | `—/band/venue/hire` |
| Position (Pos) | `channel-list-cells/PositionSelectCell.tsx` | stage-position enum USL/USR/USC/DSC/DSL/DSR/OSL/OSR/SL/SR/C |
| Stand | `channel-list-cells/StandSelectCell.tsx` | `—/LP CLAW/Short Boom/Tall Boom/Clip/Talk Stand/None` |
| Notes | inline text (~L1116) | pre-focus snapshot → **Esc reverts** |

---

## 4. Editor behaviours — preserve

- **Drag-reorder rows:** dnd-kit `DndContext`+`SortableContext` (L442–533),
  `useSortable` per `ChannelBlock` (L738), `reorderRows()` RPC
  (`reorder_channel_list_rows`) atomic 1..N reindex. Striped left accent per
  sub-snake colour.
- **Keyboard nav:** `src/lib/hooks/useCellNav.tsx` (`CellNavProvider`/`NavCell`)
  — Enter→down, Shift+Tab→left/wrap, **Esc→revert** (Name/Notes), `display:
  contents` wrappers. Two islands: input grid (colCount = enabled keys), output
  grid (colCount=5). **D5: which extra canonical-grid nav to add (range-select?)
  vs keep as-is.**
- **Section bands:** `channel-list-cells/ChannelListSectionBand.tsx` — Inputs /
  Outputs / Inventory headers (orange left-border band + count pill + actions).
  **D3: the "section gutter" treatment.**
- **Add channels:** `addChannel()` (single, auto-focus new name) + **Add many**
  `AddManyChannelsModal` (1–64, `appendRows`).
- **Stats row** (L420–438): Channels · Wireless/RF hint (`countWirelessHint`) ·
  Sub-snakes (boxes) count · DI/cable filled (`countDiFilled`).
- **Per-row autosave:** `useDebouncedSave` 400ms PATCH + `flush()` on blur;
  inheritance/override (inherited sections read-only until **Override**).
- **Title / move up / move down / remove / override** header actions.

---

## 5. Outputs sub-grid + the 5 counters — preserve exactly

- **Outputs** (`channel-list-cells/OutputBlock.tsx`, `row_kind='output'`):
  `OUTPUT_GRID` template + `OUTPUT_COL_COUNT=5`; fields `# · NAME(output_item) ·
  DESCRIPTION(output_description) · STEREO?(output_is_stereo, shows N+(N+1)) ·
  POSITION(output_position) · NOTES(output_notes) · delete`. Add via
  `appendOutputRow()` (independent output numbering). Own CellNav island.
- **InventoryAggregates** (`channel-list-cells/InventoryAggregates.tsx`) +
  `src/lib/rider-packs/aggregates.ts` — render-only, 5 counters:
  1. **Mics/DIs** `QTY·ITEM·PROVIDER` — `aggregateMicsByProvider` (input rows;
     mic→di fallback; provider→'unspecified').
  2. **Mic stands** `QTY·ITEM` — `aggregateStands`.
  3. **Cables** `QTY·LENGTH` — `aggregateCables` (the 8 lengths).
  4. **Stage boxes** `NAME·COLOR·CAPACITY·Patch` — `aggregateStageBoxes` +
     **`StageBoxPatchModal`** (one-shot patch all ports: Port|Channel|Loom|Cable,
     sequential `updateRow`).
  5. **Snakes/Looms** `LABEL·COLOR·CAPACITY` — `aggregateSubSnakes`.

---

## 6. Stage-plot link — DO NOT BREAK

`src/lib/stage-plot/server.ts` `loadPlotChannels(supabase, riderPackId)` (L181–222):
- pack resolution order: `rider_packs.linked_rider_pack_id` (kind=channel_list)
  → else tour-scope channel_list → else artist-scope channel_list;
- reads the resolved section's rows: **`r.id`, `r.channel_name`, `r.sub_snake_id`
  (→ colour/label), filtering out `row_kind='output'`, sorted by `row_index`**.
- `stage_plot_items.channel_list_row_id → channel_list_rows(id)`.
- **The re-skin must not change row ids, `channel_name`, `sub_snake_id`,
  `row_kind`, or `row_index`** — the plot reads them verbatim.

---

## 7. Templates · advance · export — preserve

- **Templates (artist library):** artist-scope `rider_packs` `kind='channel_list'`;
  `POST /api/rider-packs/[id]/assign-to-tour` deep-copies sections
  (`section_key/title/sort_order/fields/section_type`), sets new pack
  `linked_rider_pack_id=null`. Rows/snakes/boxes copied via the §7.1 propagate
  modal (separate). Library list: `artists/[id]/(library)/channel-lists/page.tsx`.
- **Advance-to-show:** no dedicated channel-list advance; show-scope packs
  (`scope='show'` + tour_id+routing_id) inherit via the folder chain
  (`POST /api/rider-packs`).
- **Export (leave intact — D4):** no shared `<GridExport>` exists yet. Today:
  Google-Docs export (`api/rider-packs/[id]/export/google-doc`), **⌘P print**
  read-view, and the **PDF channel-list block is a STUB** (`lib/rider-packs/
  pdf-render.ts` renders "see app"; aggregate fns already imported, ready to
  wire). Channel list is the intended first `<GridExport>` target **when built**.

---

## 8. Anything else found

- `mic_substitute` field persists (RowPatch) though not a column (§CL-FIX-6).
- `gear_id` FK on rows (entity link) — present, preserve.
- `output_destination` kept alongside `output_description` (115 superseded but
  column retained) — don't drop.
- RLS on all tables (workspace / artist-scope admin). Untouched by a re-skin.
- The editor's **inheritance/override** model (artist→tour→show scope, read-only
  until Override) — easy to break visually; preserve the disabled states.

---

## 9. Decisions for Adam (D1–D6) — before Stage B

- **D1 — Scope.** Re-skin the **editor** (`ChannelListEditor.tsx`) only, or also
  the read-only **`ChannelListTourSheet`** (operations display)? *(Recommend
  editor-only; the tour sheet is already a SpreadsheetGrid and lower-risk —
  could be a quick follow-up.)*
- **D2 — "hot shot" cable option.** It **does not exist** anywhere — the real
  set is the 8 lengths (6'–300'). Is "hot shot" a memory slip (preserve the 8),
  or do you want it **added** (that's a feature add, out of a pure re-skin)?
  *(Recommend: preserve the 8; add "hot shot" as a separate one-line follow-up if
  wanted.)*
- **D3 — Section gutter.** The canonical gutter puts row-group labels in a left
  gutter. Channel list's "sections" are 3 structural **blocks** (Inputs /
  Outputs / Inventory), not row-groups — a left gutter doesn't map cleanly.
  Re-skin the existing `ChannelListSectionBand` to canonical tokens (raised
  panel, tokenised band), or force a left-gutter layout? *(Recommend: tokenise
  the bands to the canonical look; don't force a gutter that fights the block
  structure. Confirm.)*
- **D4 — Export.** Leave the existing export path (Google Docs + ⌘P + stubbed
  PDF) untouched; wire `<GridExport>` only when it's built. Confirm.
- **D5 — Keyboard-nav parity.** Existing nav = Enter-down / Shift-Tab / Esc-
  revert (solid). What "parity with the canonical grid" do you want **added** —
  arrow-key cell nav? range-select + copy? *(Recommend: add arrow-key nav if
  missing; **defer** range-select/copy — it's a real feature on a bespoke grid,
  not a re-skin. Confirm the parity scope so I don't over-reach.)*
- **D6 — Risk posture.** Confirm the re-skin is **purely visual** (tokens, raised
  panel, spacing, band styling, alignment) + the agreed nav parity, with **zero
  changes to cell components, data access, RowPatch, reorder, counters, outputs,
  stage-plot link, templates**. I name every file I touch in the Stage B diff
  for your review.

---

## 10. Hard-rule compliance (Stage A)

- ✅ Every feature in the brief inventoried with file + wiring + the data-model
  citations (migrations 034/040/042/043/046/047/098/100/109/113/115).
- ✅ Discrepancy surfaced ("hot shot" doesn't exist) rather than assumed.
- ✅ Stage-plot link, templates, advance, export, internal model all catalogued
  as preserve-exactly.
- ⛔ **No code written.** Stopping for D1–D6 review.

### Stage B smoke IDs (placeholders — channel-list smoke file)
`docs/smoke-tests/channel-list.md` (+ Adam's manual smokes → `SMOKE_QUEUE.md`):
- **CL-01** Re-skin: raised panel + tokens + tokenised section bands; numbers
  right-aligned; no hardcoded colours.
- **CL-02** All columns + the column picker + lazy backfill unchanged.
- **CL-03** Mic/DI search + add-to-library + +48 autoflash.
- **CL-04** Stage-box & sub-snake pickers + Manage dialogs + capacity orphan
  guard.
- **CL-05** Cable/stand/position/provider/phantom/notes cells all work.
- **CL-06** Drag-reorder + keyboard nav (incl. any added parity) + Esc-revert.
- **CL-07** Outputs sub-grid (stereo pairing, add-output, independent numbering).
- **CL-08** The 5 counters + **StageBoxPatch** one-shot.
- **CL-09** Stage-plot link still resolves the same channels (ids/linkage intact).
- **CL-10** Templates assign-to-tour + show inheritance + export path intact.
