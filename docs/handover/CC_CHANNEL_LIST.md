# CC — Channel list: RE-SKIN only (Option A) — preserve EVERY existing feature

Channel list is a **mature, feature-dense rider-pack surface** (`ChannelListEditor`
+ `channel-list-cells/*`, Sprints incl. §8b1–8b3, §CL-FIX-6, §CL2). The job is a
**re-skin to the canonical grid look + the section gutter + the shared export +
keyboard-nav parity** — and **NOT to drop, rebuild, or simplify a single
feature**. This is the highest-risk surface for accidental feature loss, so it's
hard-gated.

## ⛔ Gated: Stage A (FULL feature inventory, no code) → review → Stage B

### Stage A — inventory EVERYTHING → `docs/handover/CHANNEL_LIST_MAP.md`
Walk the real code and confirm each item below exists + where it lives + how it's
wired. **This is a preservation checklist — every one must survive Stage B.**

**Data model**
- Rider-pack system: lives in `rider_sections` (rider packs), per artist/tour,
  **templated via the artist library**, **advanced to shows**. `channel_list_rows`
  with **`row_kind` (input | output)**. Migrations 040 · 043 (reorder + stage I/O)
  · 046 (routing) · 047 · 098 (outputs + cable_length) · 113 (phantom binary) ·
  115 (outputs v2). Supporting tables: `stage_boxes`, `sub_snakes`, mic library,
  `stage_plots` / `stage_plot_items`.

**Columns** (`src/lib/channel-list/columns.ts`)
- Permanent: **# · Name**. Opt-in: **Pos · Stage Box · Loom (sub_snake) · Cable ·
  Mic/DI · Stand · +48 (phantom) · Prov (provider) · Notes**. Enabled set persisted
  in `rider_sections.metadata.enabled_columns` + lazy backfill from data. Column
  picker (`ColumnPickerPopover`). (§CL-FIX-6: `mic_substitute` is NOT a column.)

**Smart cells (all must stay)**
- **Mic/DI combobox with type-to-search + mic library** (`MicDiSelectCell`,
  `AddMicModal`, `MicLibraryEntry`) — the §CL-FIX-6 fix.
- **Stage-box picker** (gates "Manage stage boxes"/"Manage stage I/O").
- **Loom / sub-snake picker** (`SubSnakeDialog`, gates "Manage sub-snakes").
- **Cable length** picker — **the hardcoded option set incl. "hot shot" + the
  length options** (this feeds the cable counter; don't lose any options).
- **Phantom +48** binary toggle (migration 113).
- **Provider** (band / venue / hire / unspecified).
- **Position**, **Notes**.

**Editor behaviours**
- **Drag-reorder rows** (`DndContext` → `reorderRows`).
- **Keyboard nav** (`CellNavProvider` / NavCell / focusable cells) — bring to
  canonical-grid parity, don't remove.
- **Section bands** (`ChannelListSectionBand`) → become the canonical **section
  gutter**.
- **Add many channels** (`AddManyChannelsModal`).
- **Stats/summary row** (counts e.g. sub-snakes/boxes).

**Outputs** (separate from inputs)
- **Outputs sub-grid** (`OutputBlock`, `row_kind='output'`, `appendOutputRow`) —
  IEM mixes, drive lines, wedges. Add-output. Its own grid template
  (`OUTPUT_GRID` / `OUTPUT_COL_COUNT`).

**The 5 inventory counters** (`InventoryAggregates` + `lib/rider-packs/aggregates.ts`,
render-only, computed from rows + stage_boxes/sub_snakes)
1. **Mics / DIs** — QTY · ITEM · PROVIDER (grouped by name × provider).
2. **Mic stands** — QTY · ITEM (the **stand counter**).
3. **Cables** — QTY · LENGTH (the **cable counter**, incl. hot shot etc).
4. **Stage boxes** — NAME · COLOR · CAPACITY · **Patch** (`StageBoxPatchModal`,
   one-shot patch all ports of a box).
5. **Snakes / Looms** — LABEL · COLOR · CAPACITY.

**Stage-plot link (do NOT break)**
- A stage plot = `rider_packs` row (`kind='stage_plot'`) + `stage_plots` config +
  `stage_plot_items`. `loadPlotChannels` pulls a plot's channels from the **linked
  channel-list pack** (linked pack → else a channel_list pack on the same tour).
  The re-skin must not change the channel ids / linkage the stage plot reads.

Then: list anything else you find, + any decisions for Adam. Stop.

### Stage B — re-skin (after the inventory is approved)
- Apply the **canonical grid look**: raised panel, tokens, **section gutter**
  (section labels in the left gutter, not band rows), numbers right-aligned.
- **Keyboard-nav / range-select parity** with the canonical grid where missing.
- Wire the shared **`<GridExport>`** (when it's built — channel list is its first
  target; until then leave the existing export path).
- **Every feature in the Stage-A inventory renders + works exactly as before.**
  Per rider / show, **no routing rail** (no day axis). Outputs block, the 5
  counters, mic search, stage-box/sub-snake management + Patch, drag-reorder, the
  stage-plot link, templates, advance-to-show — all intact.

## Hard rules
- **Do not drop a feature.** If the canonical grid can't host something (e.g. the
  Mic/DI combobox, the counters, the outputs sub-grid), keep the existing cell /
  block and restyle it — do NOT replace it with a plain grid cell.
- Map both sides; cite files; surface decisions. Tokens; `next build --webpack`;
  tsc 0; eslint 0; don't regress the rider-pack / stage-plot / advance flows.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify the counters, mic search, outputs, stage-box Patch, drag-reorder,
  and the stage-plot link on the preview.
- Land smoke IDs in a channel-list smoke file; add Adam's manual smokes to
  `SMOKE_QUEUE.md`.
