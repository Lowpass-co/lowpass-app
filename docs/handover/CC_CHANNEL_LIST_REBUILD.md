# CC Sprint — Channel List Rebuild + Polish

> **For a new CC agent without prior context.** Read this whole document, then read `CLAUDE.md`, then begin §CL-FIX-1.

## 1. What you're building

A polish + rebuild sprint for the channel-list editor in a tour-management app (Lowpass). The current editor works but has 11 distinct issues uncovered by a smoke run on 2026-06-02. Each issue maps to a numbered sub-phase below. Work in order, halt-and-report at ~400 LOC per sub-phase.

Treat this as 11 focused commits, not one large refactor. Each sub-phase has its own scope, its own smoke test in `docs/smoke-tests/channel-list.md`, and its own commit message.

## 2. Stack reminder

- Next 16 + React 19 + TypeScript 5 strict
- Tailwind v4 with `@theme inline` in `src/app/globals.css`
- Supabase (Postgres + RLS + Storage)
- Build: `next build --webpack` (Turbopack hangs on the user's Drive filesystem — do not use Turbopack)
- Lint: `eslint`. Typecheck: `tsc --noEmit`.
- Migrations: numbered SQL files in `database/migrations/`. Apply via `npm run db:migrate` (runs against `DATABASE_URL`/`SUPABASE_DB_URL`). Read `database/migrations/README.md` before writing one. Pick the next sequential number after the highest on `main` AND across active branches.

## 3. Hard rules

1. **Read `CLAUDE.md` at the repo root first.** It captures conventions previous agents have tripped over.
2. **Read this whole document second.** Then `docs/smoke-tests/channel-list.md` for context on what's failing.
3. **One commit per sub-phase.** Halt-and-report at ~400 LOC. If a sub-phase overshoots, split into a/b/c.
4. **Lint baseline does not regress.** `tsc --noEmit` zero. `next build --webpack` green.
5. **Token discipline.** All visual values via `var(--lp-…)` tokens defined in `src/app/globals.css`. No hardcoded hex except brand-orange alpha variants (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)`. NEVER concatenate CSS vars as JS strings (`'var(--lp-orange)' + '1a'` — doesn't resolve).
6. **No new deps unless explicitly approved.** dnd-kit, lucide-react, downshift (combobox) are already in deps — check `package.json` before adding anything.
7. **Verify before claiming.** Open the diff. File:line precision in every report.
8. **Halt-and-ask Adam** for any of the open questions flagged §10 below.
9. **Use the UI/UX skill** for every visual change. Document the consultation in the commit body.
10. **`_legacy/` is off-limits.** The leaky exceptions in budget are not licence to add more.

## 4. Where the code lives

```
src/
  components/
    channel-list/
      ChannelListTourSheet.tsx         ← /operations/[tourId]/channel-list mount
    rider-pack/
      ChannelListEditor.tsx            ← main editor (live in rider-pack section host)
      ChannelListAggregates.tsx        ← 5 inventory aggregate tables block
      channel-list-cells/
        MicDiSelectCell.tsx            ← native <select> for mic/DI — REPLACE with combobox
        CableLengthSelectCell.tsx      ← native <select> for cable length
        PositionSelectCell.tsx         ← native <select> for position
        StandSelectCell.tsx            ← native <select> for stand
        OutputBlock.tsx                ← output sub-grid (rebuild target for §CL-FIX-7)
        InventoryAggregates.tsx        ← 5-aggregate render
  app/
    (app)/
      operations/
        [tourId]/
          channel-list/
            page.tsx                   ← mount, resolves first channel_list section
  lib/
    hooks/
      useCellNav.tsx                   ← keyboard tab nav coordinate system
    rider-packs/
      resolve.ts                       ← resolves pack inheritance
      types.ts
database/
  migrations/
    040_channel_list.sql               ← initial channel_list_rows + sub_snakes + mic_library
    043_channel_list_reorder_and_stage_io.sql
    046_channel_list_routing.sql
    052_gear_canonical.sql             ← added gear_id link
    098_channel_list_outputs_and_cable_length.sql  ← added row_kind + output_* cols
```

Run `ls database/migrations | sort -n | tail -20` to confirm the highest migration on this branch before writing a new one.

## 5. Existing data model (read before §CL-FIX-6 or §CL-FIX-7)

```sql
-- channel_list_rows (one row per channel)
id              uuid PK
pack_id         uuid → rider_packs(id)
section_id      uuid → rider_sections(id)
row_index       integer        -- UNIQUE(section_id, row_index) — SHARED across inputs+outputs (problem for §CL-FIX-7)
row_kind        text DEFAULT 'input' CHECK IN ('input','output')
channel_name    text
sub_snake_id    uuid → sub_snakes(id)
stage_box       text           -- legacy text label
stage_box_id    uuid → stage_boxes(id)   -- added in 043
stage_box_position int          -- added in 043
position        text
mic             text
mic_substitute  text
di              text
stand           text
phantom_power   boolean        -- NULLABLE — 3 states problem (§CL-FIX-3)
provider        text CHECK IN ('band','venue','hire')
cable_length    text           -- added in 098
notes           text
gear_id         uuid → gear(id)  -- added in 052
output_item     text           -- added in 098 — RENAME / restructure in §CL-FIX-7
output_destination text        -- added in 098 — Adam wants this renamed to DESCRIPTION
output_qty      integer        -- added in 098
output_notes    text

-- mic_library (workspace-scoped microphone catalog)
id, workspace_id, name, kind ('mic'|'di'), provider_default, default_phantom, notes

-- sub_snakes (per-section snake/loom definitions)
id, section_id, label, color, capacity

-- stage_boxes (per-section stage box definitions)
id, section_id, label, capacity, location

-- rider_sections.metadata jsonb
-- currently holds {layout_version, sub_snake notes, mic_inventory_notes}
-- §CL-FIX-6 adds {enabled_columns: ['stage_box','position','mic',...]}
```

## 6. Sub-phase delivery plan

| Phase | Scope | LOC est. |
|---|---|---|
| §CL-FIX-1 | Tab nav fix — wrap every input/output cell in `<NavCell>` | ~250 |
| §CL-FIX-2 | Mic dropdown rebuild — combobox with type-search + inline "Add new mic" | ~400 |
| §CL-FIX-3 | Phantom power binary — UI fix + migration backfill NULL→false | ~150 |
| §CL-FIX-4 | "Add multiple channels" affordance with count prompt | ~250 |
| §CL-FIX-5 | Glass-hero header port + section divider polish | ~350 |
| §CL-FIX-6 | Column flexibility — `enabled_columns` JSONB + add/remove picker + contextual button visibility | ~500 (split 6a/6b if needed) |
| §CL-FIX-7 | Output rebuild — independent numbering, "Mark as stereo", new column set | ~400 |
| §CL-FIX-8 | Output patch matrix — stage box `output_capacity` split + matrix UI | ~400 |
| §CL-FIX-9 | Patch matrix UI rebuild — replace list with dLive/LV1 grid for inputs AND outputs | ~500 (split 9a/9b if needed) |
| §CL-FIX-10 | Stage box dropdown → "Open patch matrix" shortcut | ~150 |
| §CL-FIX-11 | Talkback / spare cables — UX TBD, halt-and-ask | ~250 |

Total ~3,600 LOC across 11 sub-phases.

---

## §CL-FIX-1 — Tab nav fix

**Bug:** Tab key only stops on Name, Notes, and Delete cells. Mic, DI, stand, position, phantom, stage box, cable length cells are not registered in the keyboard nav grid.

**Recon:**
- Read `src/lib/hooks/useCellNav.tsx` to refresh on the `<NavCell row col>` coordinate system.
- Read `src/components/rider-pack/ChannelListEditor.tsx` end-to-end and list every cell. For each cell, note: wrapped in `<NavCell>` (yes/no), col index.
- Read each `channel-list-cells/*.tsx` and confirm whether the cell internally handles focus or relies on the parent.

**Fix:**
- Wrap every editable cell in `<NavCell>` with sequential col indices.
- Verify input grid AND output grid both fully tabbable.
- Shift+Tab must work in reverse.
- Tab from end of last row of inputs should NOT jump into outputs grid — they're separate grids per Adam. Confirm by smoke.

**Smoke**: CHL-02 + CHL-03 + CHL-04 from `docs/smoke-tests/channel-list.md`.

**Report**:
```
Phase §CL-FIX-1 done. Commit: <hash>
Files modified:
  - src/components/rider-pack/ChannelListEditor.tsx (lines X-Y)
  - src/components/rider-pack/channel-list-cells/[every cell touched]
Pre-fix audit:
  - Cells NOT wrapped: [list]
  - Cells already wrapped: [list]
Verify: tsc=0, lint baseline, build green
Smoke (paste verbatim for Adam):
  1. ...
  2. ...
Blockers: [empty if clean]
```

---

## §CL-FIX-2 — Mic dropdown rebuild (combobox)

**Bug:** Current `MicDiSelectCell.tsx` uses a native `<select>`. Three issues:
1. Options clipped at the cell width — long mic names get cut off.
2. No type-to-search.
3. If the mic isn't in `mic_library`, user has to navigate elsewhere to add it.

**Fix:**
- Replace native `<select>` with a combobox (downshift if it's already in deps; otherwise build a minimal `<button>` + popover pattern).
- Popover floats above the cell — full width of the mic name, not constrained to cell width.
- Type-to-search filters the list as you type (case-insensitive substring match across `name` + `provider`).
- Last option in the filtered list is always "+ Add «typed text» to library". Click opens a small modal: name (prefilled), kind (mic/DI radio), default provider (band/venue/hire), default phantom (on/off). Save inserts into `mic_library` (workspace-scoped) and selects the new row.
- Keyboard: arrow up/down navigates options, Enter selects, Escape closes, type while popover open filters.

**UI/UX skill:** consult on the popover anchor, the "add new" affordance treatment, and the empty-search state. Submit at least 2 design alternatives in the commit body.

**Smoke**: re-run CHL-07 items (2), (3), (4) — see `docs/smoke-tests/channel-list.md`.

**Halt-and-ask if:**
- `mic_library` has different RLS than expected — check `database/migrations/040_channel_list.sql` policies before writing INSERT.
- downshift isn't in deps and Adam hasn't approved adding it. Build the popover from scratch instead.

---

## §CL-FIX-3 — Phantom power binary

**Bug:** `phantom_power` is `BOOLEAN` nullable on `channel_list_rows`, so it has three states (true / false / null). Adam wants binary (on / off).

**Fix (migration):**
- Write `database/migrations/NNN_phantom_power_binary.sql` (NNN = next sequential, check first):
  ```sql
  -- Backfill NULL → false
  UPDATE public.channel_list_rows SET phantom_power = false WHERE phantom_power IS NULL;
  -- Set NOT NULL with default
  ALTER TABLE public.channel_list_rows ALTER COLUMN phantom_power SET DEFAULT false;
  ALTER TABLE public.channel_list_rows ALTER COLUMN phantom_power SET NOT NULL;
  ```
- Write the paste-ready `_apply_NNN_supabase.sql` block alongside.
- Tracking insert into `public._lp_migrations`.

**Fix (UI):**
- Wherever phantom_power is rendered as a tri-state (probably ChannelListEditor.tsx or a cell file), replace with a binary toggle (`<button>` with on/off visual).
- When the user picks a mic that has `default_phantom`, auto-flash the cell (visual confirmation) and apply.

**Smoke**: re-run CHL-07 item (5).

**Halt-and-ask if:**
- Any row in production has phantom_power = null for a meaningful reason ("we haven't decided yet" workflow). Adam said this is binary, but check by query first.

---

## §CL-FIX-4 — Multi-add channels

**Bug:** Only single "+ Add channel" exists. Adding 32 channels for a festival is 32 clicks.

**Fix:**
- Add a second affordance next to "+ Add channel": "+ Add many…" (button with a stack icon).
- Click opens a small modal/popover: "Add how many channels?" with a number input and Add / Cancel buttons.
- Default value 8. Submit inserts that many input rows in one network call, sequentially numbered after the current max `row_index` for `row_kind='input'`.

**UI/UX skill:** consult on the button treatment — single button with a chevron/menu vs two separate buttons. Submit alternatives.

**Smoke**: new CHL-27 — see `docs/smoke-tests/channel-list.md`.

**Halt-and-ask if:**
- The single-add code path isn't reusable for batch (e.g. it does one `INSERT` per row via a single-row API endpoint). May need a new bulk endpoint.

---

## §CL-FIX-5 — Glass-hero header port + section divider polish

**Bug:** The current operations channel-list page header is functional but doesn't match the chrome treatment we've built elsewhere (Advance). Section dividers inside the editor are weak visually.

**Fix (header):**
- Read `src/components/advance/AdvanceShowHeader.tsx` in full. That's the canonical glass-hero pattern: `rounded-2xl`, brand glow top-right via `blur-3xl`, identity left, actions right.
- Update `src/app/(app)/operations/[tourId]/channel-list/page.tsx` header to match the glass-hero pattern (the same one already used for `/operations/[tourId]/riders` — read that for parity).
- Move the "Open stage plot →" link into the actions area.
- Add identity meta: tour name, currency, total channel count, pack title.

**Fix (section dividers):**
- The channel list editor has three logical sections: input grid, output grid, inventory aggregates. Each currently has a weak divider.
- Use sticky section labels with a brand-orange edge accent. Each section header sticks at the top of the scroll viewport when its section is on-screen.
- Reference the Advance section header treatment (read `src/components/advance/AdvanceSectionBuilder.tsx` for the sticky accordion pattern).

**UI/UX skill:** consult on the section header treatment. Compare:
1. Sticky pill with orange edge
2. Underlined chunky label
3. Full-width band with subtle background tint

Submit screenshots / mockups of all three in the commit body. Pick winner with Adam halt-and-ask if the call is close.

**Smoke**: CHL-06 + visual diff on the operations page.

---

## §CL-FIX-6 — Column flexibility (the big one)

**Bug:** All columns are always present. The base channel list should be just Number + Name. Every other column should be opt-in. Buttons relating to a column (e.g. "Manage sub snakes") should disappear if that column is disabled.

**Fix (data):**
- Add `enabled_columns` JSONB array to `rider_sections.metadata` (no migration needed — `metadata` is already JSONB).
- Default for new channel-list sections: `['name']` (Name is always on).
- Existing sections: backfill via TypeScript helper on first read (lazy migration) — if no `enabled_columns` in metadata, derive from "which columns currently have non-empty values on any row". This avoids a heavy SQL migration and lets existing tours look unchanged.

**Available columns** (write a single source of truth at `src/lib/channel-list/columns.ts`):
```ts
export const CHANNEL_LIST_COLUMNS = {
  number:         { label: '#',          alwaysOn: true,  permanent: true },
  name:           { label: 'Name',       alwaysOn: true,  permanent: true },
  position:       { label: 'Position',   alwaysOn: false },
  mic:            { label: 'Mic / DI',   alwaysOn: false, controlsButton: 'manage-mic-library' },
  mic_substitute: { label: 'Sub',        alwaysOn: false },
  stand:          { label: 'Stand',      alwaysOn: false },
  cable_length:   { label: 'Cable',      alwaysOn: false, controlsButton: 'cables-inventory' },
  phantom_power:  { label: '48V',        alwaysOn: false },
  provider:       { label: 'Provider',   alwaysOn: false },
  sub_snake:      { label: 'Loom',       alwaysOn: false, controlsButton: 'manage-sub-snakes' },
  stage_box:      { label: 'Stage box',  alwaysOn: false, controlsButton: 'manage-stage-boxes' },
  notes:          { label: 'Notes',      alwaysOn: false },
} as const;
```

**Fix (UI):**
- "Add column" picker: small button at the right of the header row. Click opens popover listing every NON-enabled column with checkboxes.
- Removing a column: each column header has a small "×" on hover that hides it (doesn't delete row data — soft hide).
- Contextual button visibility: in the aggregates section, "Manage sub snakes" only renders if `sub_snake` column is enabled. Same for "Cables inventory", "Manage stage boxes", "Manage mic library".

**Split into 6a / 6b** if it overshoots 400 LOC:
- §CL-FIX-6a — data + columns source of truth + read-side filtering
- §CL-FIX-6b — picker UI + remove-column UX + contextual button hookup

**UI/UX skill:** consult on the add-column picker shape, the column "×" removal affordance, and the empty state for a fresh channel list with only Number + Name.

**Smoke**: new CHL-21.

**Halt-and-ask Adam if:**
- The "soft hide" approach causes confusion ("where did my data go?"). Alternative: show a banner "5 columns hidden — Add column ▾" with a quick-restore.
- The list of available columns above doesn't match Adam's mental model — surface the diff.

---

## §CL-FIX-7 — Output rebuild

**Bug (3 separate):**
1. Output rows continue input numbering (input 1-16, outputs show as 17-20). Shared `(section_id, row_index)` unique constraint forces this.
2. No "Mark as stereo" — outputs are always single-position.
3. Output column set is wrong: current is `output_item / output_destination / output_qty / output_notes`. Adam wants: NAME / DESCRIPTION / STEREO? / POSITION / NOTES.

**Fix (data — new migration):**
- Write `database/migrations/NNN_channel_list_outputs_v2.sql`:
  ```sql
  -- Allow inputs and outputs to share row_index values (they're now independent)
  ALTER TABLE public.channel_list_rows DROP CONSTRAINT IF EXISTS channel_list_rows_section_id_row_index_key;
  ALTER TABLE public.channel_list_rows
    ADD CONSTRAINT channel_list_rows_section_kind_index_unique
    UNIQUE (section_id, row_kind, row_index);
  
  -- Rename / add output columns to match Adam's mental model
  ALTER TABLE public.channel_list_rows
    ADD COLUMN IF NOT EXISTS output_description text,
    ADD COLUMN IF NOT EXISTS output_is_stereo boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS output_position text;
  
  -- Backfill: copy output_destination → output_description for existing rows
  UPDATE public.channel_list_rows
    SET output_description = output_destination
    WHERE row_kind = 'output' AND output_destination IS NOT NULL AND output_description IS NULL;
  
  -- Renumber existing output rows: per-section, set row_index = ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY row_index)
  WITH renumbered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY row_index) AS new_index
    FROM public.channel_list_rows WHERE row_kind = 'output'
  )
  UPDATE public.channel_list_rows SET row_index = r.new_index
  FROM renumbered r WHERE public.channel_list_rows.id = r.id;
  ```
- Don't drop `output_destination` / `output_qty` in this migration — give Adam one tour to confirm the rename before destructive cleanup.
- Tracking insert + paste-ready `_apply_NNN_supabase.sql`.

**Fix (UI):**
- Output sub-grid renders columns: # | NAME | DESCRIPTION | STEREO? | POSITION | NOTES.
- "Mark as stereo" is a toggle on each output row. When on, the row visually claims two positions (e.g. shows as "1+2"). Row's `output_position` is auto-derived from `row_index` (1) and the stereo flag (so it becomes "1+2"); user can override via the POSITION column.
- Output numbering displays independently: input rows 1-N, output rows 1-M, even on the same page.

**Smoke**: new CHL-22, CHL-23, CHL-24.

**Halt-and-ask Adam if:**
- The "1+2" display vs storing two separate row_index entries — pick a convention. Recommend single row + boolean flag + UI displays "1+2".
- Existing `output_destination` data should be migrated lossless to `output_description` then dropped, or kept as a parallel column with a future cleanup migration. Recommend the latter — never destructive without explicit Adam approval.

---

## §CL-FIX-8 — Output patch matrix

**Bug:** Stage boxes only track `capacity` as a single number (treated as input capacity). Adam needs separate output capacity to model snake returns / send fans.

**Fix (data):**
- Write `database/migrations/NNN_stage_box_output_capacity.sql`:
  ```sql
  ALTER TABLE public.stage_boxes
    ADD COLUMN IF NOT EXISTS input_capacity integer,
    ADD COLUMN IF NOT EXISTS output_capacity integer NOT NULL DEFAULT 0;
  -- Backfill input_capacity = capacity for existing rows
  UPDATE public.stage_boxes SET input_capacity = capacity WHERE input_capacity IS NULL;
  -- After backfill: don't drop `capacity` yet — call it a soft alias for input_capacity
  ```
- Tracking insert + paste-ready `_apply_NNN_supabase.sql`.

**Fix (UI):**
- Stage Box dialog (`SubSnakeDialog` or `StageBoxDialog` — recon to find) gains a second capacity field "Output capacity (0 if box has no outputs)".
- Output sub-grid gets a "Patch to box…" affordance per row OR (better — clear with Adam) a button at the section header "Open output patch matrix".

**Defer the actual matrix UI rebuild to §CL-FIX-9** — this sub-phase is data + entry point only.

**Smoke**: new CHL-25 — partial. Full CHL-25 smokes after §CL-FIX-9.

---

## §CL-FIX-9 — Patch matrix UI rebuild (inputs AND outputs)

**Bug:** Current patch UI for inputs is a vertical list of ports. Adam wants a dLive / LV1 style matrix: rows are channels, columns are ports, cells light up.

**Reference UIs to read about (in commit body):** Allen & Heath dLive patch screen, Waves SoundGrid LV1 patch routing. Both are 2D grids where rows × columns intersect with a click-toggle cell.

**Fix:**
- Build a new component `src/components/channel-list/PatchMatrix.tsx`.
- Props: `stageBoxId`, `direction: 'input' | 'output'`, `onClose`, `onSave`.
- Renders a 2D grid:
  - Y axis: channels of the given direction in this channel list section (inputs OR outputs).
  - X axis: ports of the given direction on the stage box (1..input_capacity OR 1..output_capacity).
  - Cell `(channel, port)`: empty if no patch, filled (brand-orange) if patched. Click toggles.
  - One cell per row can be filled per box (a channel is only patched to one port at a time).
- Top of the matrix has the existing per-channel metadata (loom, cable length, notes) as a small inline strip per row, so the data Adam captures today doesn't get lost.
- Bottom: Save / Cancel.
- Reuse the existing assignment persistence path from the current patch list UI (don't reinvent the API).

**Replaces:** The vertical-list patch UI from §CL2 of the previous sprint. The old code can be deleted in the same commit.

**UI/UX skill:** consult heavily. Show 3 grid treatments:
1. Filled-cell with circular orange dot
2. Filled-cell with full color fill + channel label inside
3. Filled-cell with check mark icon

Submit screenshots / mockups in commit body. Halt-and-ask Adam to pick the winner if the call is close.

**Split into 9a / 9b** if it overshoots 400 LOC:
- §CL-FIX-9a — input matrix
- §CL-FIX-9b — output matrix (reuses 9a's component with `direction` prop)

**Smoke**: re-run CHL-10 (now passing as matrix), plus full CHL-25.

---

## §CL-FIX-10 — Stage box dropdown → patch matrix shortcut

**Bug:** Today, opening the patch UI requires scrolling down to the aggregates section. Adam wants to be able to open it from the inline stage box dropdown on any channel row.

**Fix:**
- The stage box dropdown (currently a native `<select>` per the recon) becomes a small popover with:
  - List of stage boxes (radio-style select)
  - A footer button "Open patch matrix for «selected box» ↗"
- Click the footer opens `<PatchMatrix>` for that box, direction=input.

**Smoke**: new CHL-26.

---

## §CL-FIX-11 — Talkback + spare cables UX (halt-and-ask)

**Bug:** Adding a "hotshot" / talkback switch should auto-add a cable. Adam wants to add spare cables.

**Status:** halt-and-ask before implementation. The mental model isn't fixed yet.

**Recon + propose:**
- Walk Adam through three options for spare cables:
  1. A separate "Cable spares" table editor in the aggregates section (rows: length, quantity, notes).
  2. A `is_spare BOOLEAN` flag on channel_list_rows where `row_kind = 'cable_spare'` (new kind) — rows live in the same table but render in a dedicated section.
  3. A `metadata.cable_spares` JSONB array on the channel list section.
- Walk through two options for talkback:
  1. A new `row_kind = 'talkback'` that's a special input row whose presence auto-adds a fixed-length cable to the aggregate.
  2. A toggle on existing input rows "Add talkback cable" that auto-bumps the cable aggregate by one of the row's cable_length.

**Halt-and-ask** Adam to pick before writing any code. Bring options to him with pros/cons.

**Smoke**: CHL-09 enhancement.

---

## 7. The "new chrome" — what to port from Advance

The user expects the new chrome to match the Advance product. Read these files in full BEFORE any visual work (especially §CL-FIX-5):

- `src/components/advance/AdvanceShowHeader.tsx` — glass hero with brand glow, identity, actions.
- `src/components/advance/TemplateMetaBar.tsx` — sticky meta bar with tabs (not all of this applies to channel list — only the visual treatment).
- `src/components/advance/AdvanceSectionBuilder.tsx` — sticky accordion section headers, the visual reference for §CL-FIX-5's section divider polish.

Channel list doesn't need the full 3-pane builder pattern Advance has — it's a single big grid. But:
- The glass hero header should look identical to Advance's.
- Section dividers inside the editor should feel like Advance's sticky accordion bars.
- The "Add column" picker can borrow visual language from the Advance "+ Add section" affordance.

Already in place for reference: `/operations/[tourId]/riders/page.tsx` ports the glass-hero pattern correctly. Read that for the parity baseline before editing `/operations/[tourId]/channel-list/page.tsx`.

## 8. Verification per sub-phase

Every sub-phase ends with:
```
hash:            <git sha of the feature commit>
files:           <each modified path:start-end>
tsc:             <0 errors confirmed>
lint:            <baseline ± delta>
build:           <next build --webpack passed>
ui-ux skill:     <one paragraph: what was consulted, what alternatives, what was picked>
smoke:           <verbatim 3-4 step instructions for Adam to run>
blockers:        <empty if clean, else list>
```

If you discover an unexpected migration was applied to the DB that's not in `database/migrations/` (drift), surface it instead of working around it.

## 9. Migration etiquette (do not skip)

- Check the highest migration number on `main` AND on `feat/*` branches before writing a new one. Seven historical migration-number collisions exist already.
- Each migration is its own transaction (the runner enforces this).
- Always idempotent: `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`. The runner aborts cleanly on throw, but idempotent SQL lets re-runs after a partial failure complete.
- Tracking insert at the end:
  ```sql
  INSERT INTO public._lp_migrations (filename, checksum, applied_by)
  VALUES ('NNN_<descriptive_name>.sql', 'backfill', 'manual-supabase-editor')
  ON CONFLICT (filename) DO NOTHING;
  ```
- Write `_apply_NNN_supabase.sql` paste-ready block alongside every migration (Adam pastes those into Supabase editor — the project's DATABASE_URL isn't in his local `.env.local`).
- Workspace scoping in SQL: always use `public.get_my_workspace_id()` and `public.is_workspace_admin()`. Never inline `SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()`.

## 10. Open questions — halt-and-ask Adam

These are the ambiguities to surface to Adam before assuming defaults:

1. **§CL-FIX-2 — combobox base.** Is downshift in deps? If yes, use it. If no, ask: add it (small dep, well-tested) or build a minimal popover from scratch?
2. **§CL-FIX-3 — phantom power null data.** Any rows where `phantom_power IS NULL` carry meaning today? Query before migrating.
3. **§CL-FIX-6 — soft-hide vs delete.** Removing a column hides cells but doesn't delete row data. Adam might prefer delete-with-confirmation. Surface both.
4. **§CL-FIX-6 — column list.** Is the proposed `CHANNEL_LIST_COLUMNS` set in §CL-FIX-6 complete? Anything missing for Adam's workflow?
5. **§CL-FIX-7 — stereo display convention.** Single row + boolean flag + UI displays "1+2" — or two separate rows linked by a stereo_pair_id? Recommend the former.
6. **§CL-FIX-7 — destructive cleanup of output_destination.** After rename to output_description lands, do a follow-up migration to drop `output_destination`? Or keep as parallel forever? Recommend one tour delay before any drop.
7. **§CL-FIX-9 — patch matrix cell treatment.** Three options listed; UI/UX skill consultation + Adam pick.
8. **§CL-FIX-11 — spare cables + talkback.** Mental model not fixed. Halt-and-ask before code.

## 11. Starting prompt — paste this into the new CC session

```
New sprint. Read these in order:
1. CLAUDE.md at the repo root
2. docs/handover/CC_CHANNEL_LIST_REBUILD.md (full spec)
3. docs/smoke-tests/channel-list.md (what's failing + what's already passing)

Branch: feat/channel-list-rebuild off main.

11 sub-phases §CL-FIX-1 → §CL-FIX-11. Halt-and-report at 400 LOC per sub-phase. Each is its own commit.

Standard report format (mandatory in every commit body):
  hash, files (path:line), tsc=0, lint baseline, build green,
  UI/UX skill consultation summary, smoke instructions for Adam, blockers.

Use the UI/UX skill on every visual change. Document the consultation.

Halt-and-ask Adam for the 8 open questions in §10 of the spec.

For the chrome work (§CL-FIX-5 especially), read the Advance components
listed in §7 BEFORE writing any header / section divider code. The
already-shipped /operations/[tourId]/riders/page.tsx is the parity
baseline for the glass hero.

Start with §CL-FIX-1 (tab nav). Recon first — list every cell in
ChannelListEditor.tsx, identify which are wrapped in <NavCell> and which
aren't, then fix.

Out of scope: any rider, advance, budget, payroll, stage plot, or
operations work outside channel list. Stay focused.
```

## 12. Where to find this spec on disk

`/Users/lowpass/Documents/lowpass-app/docs/handover/CC_CHANNEL_LIST_REBUILD.md`
