# CURSOR PROMPT — R11

## Pack editor polish: top-bar condense, page scroll, stage boxes, BOX/I/O pickers

---

## 0. Read-this-first

This prompt has 6 numbered steps. They build on each other, but Step 1 (top-bar) and Step 2 (scroll) are independent of Steps 3-6 (routing model). If you stall, the natural break is after Step 2 — the editor is shippable in that state.

**Hard rules:**

1. No new npm dependencies.
2. No `localStorage` / `sessionStorage`.
3. All colours via Lowpass tokens (`var(--lp-*)` in CSS, `bg-lp-*` / `text-lp-*` / `border-lp-*` in Tailwind classes). Pill backgrounds use hex-and-alpha (e.g. `#FF45001a`) — never `'var(--lp-orange)' + '1a'`.
4. Migrations go in `database/migrations/` (NOT `supabase/migrations/`). Number is the next sequential — check the highest existing file in that folder and use the next integer (likely `045_…` or higher).
5. RLS policies use `public.get_my_workspace_id()` and `public.is_workspace_admin()` (already defined in `034_rider_pack_system.sql`). Do not invent new helpers.
6. After every step, run `npx tsc --noEmit`. Fix any errors before continuing. Do not run `next build` locally — the project lives on Google Drive and the build will hang. Vercel handles real builds.
7. Commit at the end of each numbered step using the conventional commit message indicated.

---

# STEP 1 — Top bar condense

**Problem:** The area between the page title and the channel list shows the same information twice. The 3-card stat strip (LAST EDIT / SECTIONS / SHARE LINKS) is duplicated by the row below (LAST EDIT just now / GOOGLE DOC NOT EXPORTED / SHARING / "No share links yet" / Create link). Plus a collapsed RIDER TEMPLATES strip taking a row to itself for no payoff. Result: ~50% of vertical space wasted before the user reaches the actual channel list.

**Fix:** Single condensed header — title + buttons on row 1, ONE inline metadata strip on row 2, nothing else above the section editor.

**File:** `src/components/rider-pack/PackEditor.tsx`. Possibly `PackStatCards.tsx` (rewrite or remove).

**New layout:**

```tsx
{/* breadcrumb stays as-is */}

{/* Row 1 — title + actions */}
<div className="flex items-start justify-between gap-4 mb-2">
  <div className="flex items-center gap-3">
    <h1 className="text-2xl font-semibold text-lp-text">{pack.title}</h1>
    <ScopePill scope={pack.scope} />
  </div>
  <div className="flex items-center gap-2">
    <ShareButton pack={pack} />     {/* primary orange, opens Share dropdown */}
    <ExportButton pack={pack} />    {/* outline secondary */}
    <OverflowMenu pack={pack} />    {/* ⋯ — Delete pack, Save as template, etc. */}
  </div>
</div>

{/* Row 2 — chip-style metadata strip */}
<div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-lp-text-secondary mb-6">
  <span><span className="text-lp-text-tertiary">Last edit</span> {relativeTime(pack.updated_at)}</span>
  <span className="text-lp-border">·</span>
  <span><span className="text-lp-text-tertiary">Sections</span> {sectionCount}</span>
  <span className="text-lp-border">·</span>
  <span><span className="text-lp-text-tertiary">Share links</span> {shareLinkCount}</span>
  <span className="text-lp-border">·</span>
  <button className="text-lp-text-secondary hover:text-lp-text" onClick={openTemplates}>
    Templates ›
  </button>
  <span className="text-lp-border">·</span>
  <span className="text-lp-text-tertiary">{googleDocStatus}</span>
</div>
```

**`googleDocStatus`** is a string:
- `"No Google Doc"` if `pack.google_doc_id` is null
- `"Google Doc · exported {relativeTime}"` if it exists

**`ShareButton`** (new or refactored):
- Looks like a primary button: `bg-lp-orange text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-lp-orange/90`.
- Click opens a dropdown panel anchored to the button. Panel contains:
  - Header: "Share this pack"
  - "Create share link" with "Protect with password" checkbox and Create button
  - List of existing share links with view counts (placeholder counts ok — still TODO(R15))
  - Each link: copy-to-clipboard button, revoke button
- All the sharing UI that previously lived in the standalone row moves here.

**`ExportButton`** (new or refactored):
- Outline secondary: `border border-lp-border text-lp-text px-3 py-1.5 rounded-lg text-sm hover:bg-lp-surface-hover`.
- If no Google Doc yet: label is "Export". Click → calls existing `runGoogleDocExport`.
- If Google Doc exists: label is "Update doc". Click → updates. Right-click or long-press → option to "Open in Google Docs" (or surface in OverflowMenu).

**Remove:**
- The standalone RIDER TEMPLATES strip below the stat cards. Templates is now reachable via the chip strip's "Templates ›" button.
- The standalone row containing LAST EDIT / GOOGLE DOC / SHARING / "No share links yet" / Create link / Protect with password. All that functionality moves into ShareButton + ExportButton + chip strip.
- The 3-card stat strip (`PackStatCards.tsx`). Replaced by the chip strip above. **Delete the file** if it's not used elsewhere — verify with `grep -r "PackStatCards" src/`.

**Acceptance:**
- Header is at most ~80px tall (title row + chip row + breadcrumb above). The channel list is visible above the fold.
- Share dropdown opens, all sharing functionality works.
- Export button updates label based on Google Doc state.
- No duplicate "Last edit" anywhere on the page.
- `npx tsc --noEmit` passes.

**Commit:** `feat(rider-pack): condense top bar; fold sharing into share dropdown`

---

# STEP 2 — Page scroll + sticky table header

**Problem:** Page doesn't scroll. Long channel lists are unreachable.

**Fix:** Page scrolls naturally. Channel list table fills available width and grows with content. Column headers stay visible while scrolling the rows.

**Files:** `src/components/rider-pack/PackEditor.tsx`, `src/components/rider-pack/ChannelListEditor.tsx`, possibly the `app/(app)/.../layout` that wraps the editor.

**Changes:**

1. Find any wrapper with `overflow-hidden` or `h-screen` constraining the editor's vertical growth. Remove the constraint or change to `min-h-screen` so content can grow past viewport.
2. The editor's main container should be `flex flex-col gap-6` with no `overflow` constraint — let the page body scroll naturally.
3. The 3-column layout (sections list left, content middle/right) — the sections list (left rail) should be `sticky top-{header-offset}` so it stays visible as the user scrolls long content. Top offset matches the height of the breadcrumb + title + chip strip. Use a CSS variable or compute via a constant.
4. In `ChannelListEditor.tsx`: the table's `<thead>` (the row of column labels: # / NAME / BOX / I/O / POS / DI/CABLE / MIC / SUB / STAND / +48 / PROV / NOTES) gets `sticky top-{header-offset} bg-lp-surface z-10`. When the user scrolls past the row of column labels, the labels stick to the top of the viewport.
5. The 4 in-section stat cards (CHANNELS / WIRELESS / SUB-SNAKES / DI/CABLE) stay where they are — above the table inside the section. They scroll away normally; only the column header row sticks.

**Right-side fill:** The channel list table currently leaves dead space on the right (visible in the screenshot — the NOTES column doesn't reach the right edge). The table container should be `w-full` and the table itself `w-full table-fixed` (or `table-auto` if columns size to content). Use Tailwind class `min-w-0 flex-1` on the parent flex container so it expands.

**Acceptance:**
- Scroll the page — long content reachable.
- Column header row sticks to top when scrolling rows.
- Section list (left rail) stays visible while scrolling.
- Table fills the right pane horizontally. NOTES column reaches the right edge.

**Commit:** `feat(rider-pack): page scroll + sticky table header`

---

# STEP 3 — Stage box entity (migration + dialog)

**Problem:** Stage I/O is a free-text field on each row. No capacity tracking, no consistent labels, no colour. Sub-snakes have proper entities; stage boxes don't.

**Fix:** Mirror sub-snakes — make stage boxes a real entity with label, capacity, colour. Migrate existing text to entities.

**Migration:** `database/migrations/<next>_channel_list_routing.sql` (next number after the highest existing — likely `045_…`).

```sql
-- 1. Add capacity to sub_snakes (currently missing)
ALTER TABLE sub_snakes
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 8;

-- 2. Stage boxes — mirror of sub_snakes shape
CREATE TABLE IF NOT EXISTS stage_boxes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES rider_pack_sections(id) ON DELETE CASCADE,
  label       text NOT NULL,
  colour      text NOT NULL,
  capacity    integer NOT NULL DEFAULT 16,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stage_boxes_section_idx ON stage_boxes(section_id);

ALTER TABLE stage_boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_boxes_select" ON stage_boxes FOR SELECT
  USING (pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "stage_boxes_insert" ON stage_boxes FOR INSERT
  WITH CHECK (pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "stage_boxes_update" ON stage_boxes FOR UPDATE
  USING (pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()))
  WITH CHECK (pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()));
CREATE POLICY "stage_boxes_delete" ON stage_boxes FOR DELETE
  USING (pack_id IN (SELECT id FROM rider_packs WHERE workspace_id = public.get_my_workspace_id()));

-- 3. New routing columns on channel_list_rows
ALTER TABLE channel_list_rows
  ADD COLUMN IF NOT EXISTS sub_snake_position  integer,
  ADD COLUMN IF NOT EXISTS stage_box_id        uuid REFERENCES stage_boxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_box_position  integer;

-- 4. Uniqueness — a position within an entity can be used by at most one row
CREATE UNIQUE INDEX IF NOT EXISTS channel_list_rows_subsnake_position_unique
  ON channel_list_rows(sub_snake_id, sub_snake_position)
  WHERE sub_snake_id IS NOT NULL AND sub_snake_position IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channel_list_rows_stagebox_position_unique
  ON channel_list_rows(stage_box_id, stage_box_position)
  WHERE stage_box_id IS NOT NULL AND stage_box_position IS NOT NULL;

-- 5. Migrate existing stage_box text → entities (best-effort)
DO $$
DECLARE
  r RECORD;
  v_box_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT pack_id, section_id, stage_box FROM channel_list_rows
           WHERE stage_box IS NOT NULL AND stage_box <> ''
  LOOP
    INSERT INTO stage_boxes (pack_id, section_id, label, colour, capacity)
    VALUES (r.pack_id, r.section_id, r.stage_box, '#737373', 16)
    RETURNING id INTO v_box_id;

    UPDATE channel_list_rows
       SET stage_box_id = v_box_id
     WHERE pack_id = r.pack_id
       AND section_id = r.section_id
       AND stage_box = r.stage_box;
  END LOOP;
END$$;

-- 6. Drop the old text column
ALTER TABLE channel_list_rows DROP COLUMN IF EXISTS stage_box;
```

**Notes:**
- `capacity` on sub-snakes defaults 8, on stage boxes defaults 16. Reasonable starting points.
- Uniqueness indices are partial (only enforced when both columns are non-null) so empty rows don't conflict.
- Old `stage_box` text values become stage box entities with label = original text and capacity = 16. Manual cleanup may be needed for production data.

**TypeScript types:** in `src/lib/rider-packs/types.ts`, add:

```ts
export type StageBox = {
  id: string;
  pack_id: string;
  section_id: string;
  label: string;
  colour: string;
  capacity: number;
  position: number;
};

// extend SubSnake with capacity
export type SubSnake = {
  // ... existing fields
  capacity: number;
};

// extend ChannelListRow with new routing fields, drop stage_box
export type ChannelListRow = {
  // ... existing fields except stage_box
  sub_snake_id: string | null;
  sub_snake_position: number | null;
  stage_box_id: string | null;
  stage_box_position: number | null;
  // ... rest unchanged
};
```

**Data layer:** in `src/lib/rider-packs/channel-list.ts`, add stage-box CRUD mirroring sub-snake CRUD:

```ts
listStageBoxes(supabase, sectionId): Promise<StageBox[]>
createStageBox(supabase, { packId, sectionId, label, colour, capacity }): Promise<StageBox>
updateStageBox(supabase, id, patch): Promise<void>
deleteStageBox(supabase, id): Promise<void>
```

Update `resolvePack` to load `stage_boxes` per section and attach as `stageBoxes` on the resolved section.

**Dialog:** create `src/components/rider-pack/StageBoxDialog.tsx`. Mirror `SubSnakeDialog.tsx` exactly — same UX, same colour palette, same flow. Per-row in the dialog: colour swatch (clickable picker), label (inline editable), capacity (number input, 1-64), delete.

Wire `Manage stage I/O` button (already in the section header per the screenshot) to open this dialog.

**Acceptance:**
- Migration applies cleanly to your local Supabase.
- Existing test rows with stage_box text values now show stage_box_id populated.
- Manage stage I/O dialog opens, can add/edit/delete stage boxes with colour and capacity.
- `npx tsc --noEmit` passes.

**Commit:** `feat(rider-pack): stage box entity + management dialog`

---

# STEP 4 — BOX picker (sub-snake position)

**Problem:** BOX cell is a free text input. Should be a structured picker over sub-snakes and their positions.

**Fix:** New `PositionPicker` component. BOX cell uses it bound to `(sub_snake_id, sub_snake_position)`.

**File:** `src/components/rider-pack/PositionPicker.tsx` (new). `src/components/rider-pack/ChannelListEditor.tsx` (modify the BOX cell).

**Component shape:**

```ts
type PositionPickerProps = {
  // current value on this row
  entityId: string | null;
  position: number | null;
  // available entities (sub-snakes OR stage boxes)
  entities: Array<{ id: string; label: string; colour: string; capacity: number }>;
  // positions already used by OTHER rows in this section, keyed by entity id
  usedPositions: Record<string, Set<number>>;
  // callbacks
  onChange: (entityId: string | null, position: number | null) => void;
  onManageClick: () => void;     // opens the relevant manage dialog
  // for screen-readers and the trigger label
  ariaLabel: string;
};
```

**Trigger:** the cell renders as a button. Label format:
- If unset: em-dash `—` in `text-lp-text-tertiary`.
- If set: `{label}-{position}` (e.g. `A-3`) with a 6px colour dot to its left matching `entity.colour`.

**Dropdown:** opens below the cell, anchored. Width auto, max-height ~320px with internal scroll. Content:

```
┌────────────────────────────────────────────┐
│ ● A — Drum sub                  4/8 used   │
│   ▢ A-1   Kick In                          │
│   ▢ A-2   Kick Out                         │
│   ✓ A-3   (this row)                       │
│   ▢ A-4   (free)                           │
│   ▢ A-5   (free)                           │
│   ...                                      │
│                                            │
│ ● B — Bass sub                  0/4 used   │
│   ▢ B-1   (free)                           │
│   ...                                      │
│                                            │
│ — Clear assignment                         │
│ + Manage sub-snakes                        │
└────────────────────────────────────────────┘
```

**Position state per row:**
- "free" → enabled, clickable. Background neutral.
- "used by this row" → highlighted (`bg-lp-orange/10`), shown with check or "this row" label, clicking re-confirms.
- "used by another row" → disabled (`text-lp-text-tertiary cursor-not-allowed opacity-50`). Tooltip on hover: `"Used by row #N — {channel name}"`.

**Capacity enforcement:** only render positions 1..capacity. If a sub-snake has capacity 8, only A-1 through A-8 appear. A-9+ never shown.

**On select:** call `onChange(entityId, position)`. Picker closes. Save flows through the row's debounced save.

**On "Clear assignment":** `onChange(null, null)`. Clears the row's entity + position.

**On "Manage sub-snakes":** call `onManageClick()` which opens `SubSnakeDialog`. After the dialog closes, the picker rebuilds its option list from updated state.

**Wiring in ChannelListEditor:** the BOX cell (currently a text input) becomes:

```tsx
<PositionPicker
  entityId={row.sub_snake_id}
  position={row.sub_snake_position}
  entities={subSnakes}
  usedPositions={usedSubSnakePositions}
  onChange={(id, pos) => updateRow(row.id, { sub_snake_id: id, sub_snake_position: pos })}
  onManageClick={openSubSnakeDialog}
  ariaLabel={`Sub-snake position for channel ${row.row_index}`}
/>
```

`usedSubSnakePositions` is computed once per render from the row list:

```ts
const usedSubSnakePositions = useMemo(() => {
  const map: Record<string, Set<number>> = {};
  for (const r of rows) {
    if (r.id === currentRowId) continue;       // exclude the row being edited
    if (r.sub_snake_id && r.sub_snake_position != null) {
      (map[r.sub_snake_id] ??= new Set()).add(r.sub_snake_position);
    }
  }
  return map;
}, [rows, currentRowId]);
```

(Conceptually — pass this once per render and let the picker filter against it. Don't recompute per row — compute once for the whole table.)

**Acceptance:**
- BOX cell shows `—` when unset, `A-3` (with colour dot) when set.
- Click opens dropdown. Sub-snakes listed with capacity counts. Positions enabled/disabled correctly.
- Picking a position saves to `sub_snake_id` and `sub_snake_position` on the row.
- Used positions in other rows are disabled with tooltip.
- Clear assignment works.
- `npx tsc --noEmit` passes.

**Commit:** `feat(rider-pack): box picker for sub-snake position`

---

# STEP 5 — I/O picker (stage box position)

**Problem:** Same as BOX, but for stage boxes.

**Fix:** Reuse `PositionPicker` with stage box data. The component is generic — it takes any list of entities with `{id, label, colour, capacity}`.

**Wiring in ChannelListEditor:** the I/O cell becomes:

```tsx
<PositionPicker
  entityId={row.stage_box_id}
  position={row.stage_box_position}
  entities={stageBoxes}
  usedPositions={usedStageBoxPositions}
  onChange={(id, pos) => updateRow(row.id, { stage_box_id: id, stage_box_position: pos })}
  onManageClick={openStageBoxDialog}
  ariaLabel={`Stage box I/O for channel ${row.row_index}`}
/>
```

Display format on the cell label: `SB1-7` (e.g. label "SB1" + position 7).

**Acceptance:**
- I/O cell shows `—` when unset, `SB1-7` when set.
- Picker enforces capacity and uniqueness, same as BOX.
- Manage stage I/O button opens StageBoxDialog. After close, picker reflects changes.
- `npx tsc --noEmit` passes.

**Commit:** `feat(rider-pack): i/o picker for stage box position`

---

# STEP 6 — Capacity changes that invalidate existing assignments

**Problem:** What happens if user has Sub-snake A with capacity 8, all 8 positions used, then drops capacity to 4 in the dialog? Positions 5-8 are now invalid.

**Fix:** In `SubSnakeDialog` and `StageBoxDialog`, when the user lowers a capacity:
1. Compute count of channel rows currently using positions > newCapacity.
2. If > 0, show a confirmation: `"Lowering capacity will unassign N channel(s) (positions {pos}, {pos}, ...). Continue?"`.
3. On confirm, run the update + a follow-up that sets `sub_snake_position = NULL` (or `stage_box_position = NULL`) for affected rows. Same for `_id` only if the row had no fallback. Simplest: also null the id.
4. On cancel, revert the capacity input to its previous value.

**Increasing capacity needs no special handling** — strictly more positions become available.

**Deleting an entity (existing functionality):** verify the cascade is correct. `ON DELETE SET NULL` is on the FKs, so deleting a sub-snake nulls `sub_snake_id` on all rows that referenced it. After the FK fires, run a cleanup to also null `sub_snake_position` for those rows (since position without entity is meaningless). Same for stage boxes.

**Acceptance:**
- Lowering capacity shows confirmation, applies cleanly.
- Deleting an entity nulls both `id` and `position` on referencing rows.
- No orphaned `position` values without an `id`.
- `npx tsc --noEmit` passes.

**Commit:** `feat(rider-pack): handle capacity changes and entity deletion`

---

## Final acceptance gate

Before reporting done:

- [ ] Top of the page is a single condensed header — title, scope pill, Share/Export buttons, then ONE chip strip with metadata. No duplicate sharing row, no duplicate templates strip.
- [ ] Page scrolls. Column header row sticks to the top when scrolling. Channel table fills horizontal width.
- [ ] Manage sub-snakes dialog has capacity field. Manage stage I/O dialog exists and mirrors it.
- [ ] BOX cell is a structured picker showing sub-snakes with positions. Used positions disabled. Capacity enforced.
- [ ] I/O cell is a structured picker showing stage boxes with positions. Same enforcement.
- [ ] Capacity changes that invalidate existing assignments prompt the user.
- [ ] All existing Phase 1 wins still work — typing doesn't freeze, drag-to-reorder works, sub-snake colour stripes render.
- [ ] `npx tsc --noEmit` passes.

If any are red, fix before declaring done.

---

## Out of scope

Anything not listed above. Specifically:

- Output lists (stage outs / FOH outs) — that's R12.
- Derived inventory — R13.
- Hire list section — R14.
- Templates system — R15.
- Share-link tracking implementation (counts beyond placeholders) — R16.
- Attachments — R17.
- Stage plot builder — far future.

Leave `// TODO(R{n}):` comments if any of these come up while working.
