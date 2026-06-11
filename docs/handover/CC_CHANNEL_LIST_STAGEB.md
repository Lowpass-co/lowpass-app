# CC — Channel list Stage B: GO (D1–D6 answered)

`CHANNEL_LIST_MAP.md` reviewed; the "hot shot" claim **spot-verified** (grep:
zero matches; `cable_length` is a free string + the 8-length set). The inventory
is accurate. This is a **purely visual re-skin + arrow-key nav** — zero changes to
cells, data, reorder, counters, outputs, the stage-plot link, templates, or export.

## Decisions

- **D1 — Scope: editor only.** Re-skin `ChannelListEditor`. **Defer** the
  read-only `ChannelListTourSheet` (operations display) — note it as a quick
  follow-up if it ends up looking inconsistent beside the re-skinned editor, but
  not this pass.
- **D2 — "hot shot" is a real DEVICE, not a cable length — and it's a FUTURE
  FEATURE, NOT this re-skin.** Adam clarified: a Radial HotShot splits a mic to two
  desk inputs (mic ↔ talkback), and **fitting one on a channel adds an XLR**. So
  it's NOT a cable-picker option (CC was right it isn't there); it's a per-channel
  device flag that should **+1 the XLR / cable inventory count**. For THIS pass:
  **preserve the existing 8 cable lengths + the counters exactly as-is; do NOT add
  hot shot.** The hot-shot feature (a channel flag in the Mic/DI area that adds an
  XLR to the cable/inventory count) is a **separate follow-up** — see
  `GRID_SURFACES_DESIGN.md` (channel list). It also feeds the export production
  summary's cable/XLR roll-up.
- **D3 — Tokenise the existing `ChannelListSectionBand` to the canonical look; do
  NOT force a left gutter.** Good catch: channel list's "sections" are 3
  structural blocks (Inputs / Outputs / Inventory), not budget-style row-groups —
  the left-gutter section treatment is for row-group surfaces (budget/rooming/
  payroll) and doesn't apply here. Make the bands match the canonical look via
  tokens; keep the block structure.
- **D4 — Export: leave the existing path** (Google Docs + ⌘P + stubbed PDF).
  Wire `<GridExport>` only when it's built — channel list is its first target,
  later. Confirmed.
- **D5 — Keyboard: add arrow-key cell nav** (↑↓←→) if missing, for canonical-grid
  parity. **DEFER range-select + copy/paste** — that's a real feature, its own
  pass, not a re-skin.
- **D6 — Risk posture: CONFIRMED.** Purely visual (tokens, raised panel, canonical
  cell/header styling) + the arrow-key nav from D5. **ZERO changes** to: the 11
  columns + picker + lazy backfill, the 10 smart cells (Mic/DI combobox, stage-box/
  sub-snake PositionPicker, cable/stand/position/provider/phantom/notes),
  drag-reorder, the Outputs sub-grid, the 5 inventory counters + StageBoxPatch, the
  stage-plot link, templates, advance, export. **Name every file you touch in the
  Stage-B diff** for review.

## Hard rules
- Tokens only; `next build --webpack`; tsc 0; eslint 0. Don't regress any rider-pack
  / stage-plot / advance / template flow.
- **Verify before claiming** — name files/lines; mark build vs needs-live. I
  Chrome-verify the counters, mic search, outputs, stage-box Patch, drag-reorder,
  arrow-key nav, and the stage-plot link on the preview.
- Land a channel-list smoke block + add Adam's manual smokes to `SMOKE_QUEUE.md`.
