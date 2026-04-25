# CURSOR PROMPT — R8 v2 + R10 (combined)

## Pack editor: save-freeze fix, visual rebuild, and channel list section type

---

## 0. Read-this-first

This is a two-phase prompt. **Phase 1 must be fully committed before Phase 2 begins.** If you stall, hand off cleanly at the end of Phase 1 — the editor is shippable in that state.

**Hard rules across both phases:**

1. No new npm dependencies unless explicitly listed in this prompt. Use existing libs only.
2. No `localStorage` / `sessionStorage` / `indexedDB`. State lives in React + Supabase only.
3. All colours via Lowpass design tokens (`var(--lp-*)` or `bg-lp-*` / `text-lp-*` / `border-lp-*` Tailwind classes). The only exception is hex-with-alpha for pill backgrounds (see Phase 1 Step 5 — there's a known CSS bug to fix).
4. `process.env` is server-side only. Don't reference env vars in client components.
5. Migrations are SQL files in `supabase/migrations/`. Do not edit existing migrations — always create new ones.
6. After every numbered step, run `pnpm typecheck` and fix any errors before moving on. If a step changes API surface, also run `pnpm build` and fix.
7. Commit at the end of each numbered step with the conventional commit message indicated.

**Tokens reference (already established in `globals.css`):**

```
--lp-bg              page background
--lp-surface         card / row background
--lp-surface-hover   row hover
--lp-border          1px border
--lp-border-light    very subtle divider
--lp-text            primary text
--lp-text-secondary  meta text (~70% contrast)
--lp-text-tertiary   labels / placeholders
--lp-orange          #FF4500 — brand primary
--lp-error           #EF4444
```

Tailwind classes that resolve to those tokens: `bg-lp-surface`, `text-lp-text-secondary`, `border-lp-border-light`, etc.

---

# PHASE 1 — R8 v2: save fix + visual rebuild

**Goal:** Editor stops freezing on keystroke. Visual matches Bug Reports page (stat strip pattern) and Commissions tab (table pattern). Share = primary orange button, Export = secondary outline.

**Files touched in Phase 1:**
- `src/components/rider-pack/PackEditor.tsx` (modify)
- `src/components/rider-pack/FieldEditors.tsx` (modify)
- `src/components/rider-pack/NewSectionDialog.tsx` (modify)
- `src/hooks/useDebouncedSave.ts` (create)
- `src/components/rider-pack/PackStatCards.tsx` (create)

---

## Step 1 — Add `useDebouncedSave` hook

Create `src/hooks/useDebouncedSave.ts`. No new deps. Plain `setTimeout` + `useRef` + cleanup on unmount and on identity-change of the save fn.

API:

```ts
type DebouncedSave<T> = {
  schedule: (value: T) => void;
  flush: () => Promise<void>;        // run any pending save immediately
  cancel: () => void;                 // drop any pending save
  isPending: () => boolean;
};

function useDebouncedSave<T>(
  saveFn: (value: T) => Promise<void>,
  delayMs?: number, // default 400
): DebouncedSave<T>;
```

Behaviour:

- `schedule(value)` resets a timer; when it fires, calls `saveFn(latestValue)`.
- If `schedule` is called again while a save is in flight, queue the next value and run it after the in-flight save resolves.
- `flush` awaits the queued + in-flight saves and returns when both are settled.
- `cancel` clears the timer and drops any queued value (does NOT cancel an in-flight network call — that just resolves and is ignored).
- Unmount cleanup must call cancel.

**Commit:** `feat(rider-pack): add useDebouncedSave hook`

---

## Step 2 — Remove `await refresh()` from per-field save paths in `PackEditor.tsx`

In `src/components/rider-pack/PackEditor.tsx`, find `saveSelectedSection` (around line 157-172). Currently it calls `await refresh()` after every save, which forces a full pack refetch on every keystroke. That's the freeze.

Change behaviour:

- Field-level saves (called from `onFieldsChange`, `onTitleChange`, `onSubtitleChange` etc. — anything that updates the contents of an existing section) **must not** call `refresh()`.
- Structural saves (add section, delete section, reorder sections) **must** call `refresh()` so the section list re-renders.

Add a parameter to `saveSelectedSection`: `saveSelectedSection(patch, opts?: { refresh?: boolean })`. Default `refresh: false`. Callers that change section structure pass `{ refresh: true }`.

Update existing call sites:

- `onFieldsChange={(fields) => saveSelectedSection({ fields })}` → no change (default no-refresh).
- Add-section / delete-section / reorder-section handlers → pass `{ refresh: true }`.

After the patch is sent, optimistically update the section in local state (`setPack(prev => ...)`) so the UI is consistent without a refetch.

**Commit:** `fix(rider-pack): stop refetching on every keystroke (save freeze)`

---

## Step 3 — Local draft state + debounced save in field editors

In `src/components/rider-pack/FieldEditors.tsx`, every field editor that takes a `value` from props and reports back via `onChange` needs:

1. Local `draft` state initialised from `value`. This is what the input is bound to.
2. A `useDebouncedSave` instance whose `saveFn` calls the parent's `onChange(draftValue)`.
3. On every keystroke: `setDraft(newValue); save.schedule(newValue)`.
4. On blur: `save.flush()` (force immediate save).
5. `useEffect` reconciliation: if `value` (from props) changes AND we have no pending save AND the draft differs, update `draft = value`. This handles the "another tab edited the pack" case without clobbering the user's typing.

Apply this to: `ShortTextField`, `LongTextField`, `NumberField`, `DateField`. Toggle/select fields don't need debouncing — they save on change.

Acceptance for this step: typing a long sentence into a field never causes the UI to stutter. Closing the field saves immediately.

**Commit:** `feat(rider-pack): debounced field saves with local draft state`

---

## Step 4 — Slim 3-card stat strip (`PackStatCards.tsx`)

Create `src/components/rider-pack/PackStatCards.tsx`. Three cards in a flex row, gap-3:

| Card | Content |
|------|---------|
| Last edit | Relative time (e.g. "2 minutes ago") of `pack.updated_at` |
| Sections | Count of sections, with section_type breakdown shown as small caption underneath (e.g. "4 — 2 fields, 1 channel list, 1 attachments") |
| Share links | Count of active share links + total open count (e.g. "2 links · 14 opens"). Card is clickable → opens Share panel/dialog. |

Card pattern (matches Bug Reports stat cards):

```tsx
<div className="rounded-xl px-4 py-3 bg-lp-surface border border-lp-border">
  <div className="text-xs text-lp-text-tertiary uppercase tracking-wide">{label}</div>
  <div className="mt-1 text-lg font-semibold text-lp-text">{value}</div>
  {caption && <div className="mt-0.5 text-xs text-lp-text-secondary">{caption}</div>}
</div>
```

Container: `flex gap-3 mb-6` (drop the 5-col grid from previous version).

Render this component in `PackEditor.tsx` directly under the top bar.

**Commit:** `feat(rider-pack): slim 3-card stat strip`

---

## Step 5 — Top bar rebuild + Share-primary / Export-secondary

In `PackEditor.tsx`, rebuild the top bar:

- Two rows.
- Row 1: pack title (large, `text-2xl font-semibold text-lp-text`) and a scope pill on the right end of the row.
- Row 2: action buttons, right-aligned.
  - **Share** = primary, orange. `bg-lp-orange text-white hover:bg-lp-orange/90`. Leftmost in the action group.
  - **Export** = secondary outline. `border border-lp-border text-lp-text hover:bg-lp-surface-hover`. Right of Share.
  - Any other actions (e.g. "Save as template", "Delete pack") go in a `…` overflow menu to the right of Export.

**Critical fix while you're here — pill backgrounds:**

Search the codebase for `'var(--lp-orange)' + '1a'` or any pattern of `'var(--' + ... + ')' + <hex>`. These produce invalid CSS strings — the resolved style is something like `var(--lp-orange)1a` which the browser drops. Replace with hex-and-alpha:

```ts
// BEFORE (broken):
backgroundColor: 'var(--lp-orange)' + '1a',
border: `1px solid ${'var(--lp-orange)'}33`,

// AFTER (works):
backgroundColor: '#FF45001a',
border: '1px solid #FF450033',
```

If there are pills with dynamic colours (e.g. status pills using a `color` prop), the `color` prop must be a hex string. Update call sites accordingly. Do not pass `var(...)` to the Pill component.

**Commit:** `feat(rider-pack): top bar with share-primary / export-secondary; fix pill bg CSS`

---

## Step 6 — Field rows in Commissions-style table

In `FieldEditors.tsx` (or wherever the field list renders inside a section), restructure so all fields in a section live inside one container:

```tsx
<div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
  {fields.map((f, i) => (
    <FieldRow key={f.id} field={f} isLast={i === fields.length - 1} />
  ))}
</div>
```

Each `FieldRow`:

- 2-column flex layout. Left column: `Label` (28% width on desktop, full width stacked on mobile). Right column: `Value` editor.
- Padding: `px-4 py-3`.
- Border-bottom between rows: `border-b border-lp-border-light` (omit on last row).
- **Drop the Type column from the at-rest view.** Type is implicit from the editor that renders. Show field type only in:
  1. The "Add field" dropdown (use human language: "Short text", "Long text", "Yes/No", "Number", "Date", "Choice").
  2. A tiny secondary line under the label, only visible if the field is empty (e.g. "Long text" in `text-lp-text-tertiary text-xs`).
- Actions (delete, duplicate) appear on row hover only, right-aligned. Use `opacity-0 group-hover:opacity-100 transition` on a wrapper with `group` on the row.

**Commit:** `feat(rider-pack): commissions-style field rows`

---

## Step 7 — `NewSectionDialog` backdrop polish

In `src/components/rider-pack/NewSectionDialog.tsx`:

- Backdrop: `backdrop-blur-md bg-black/40 fixed inset-0 z-40`.
- Dialog: `bg-lp-surface border border-lp-border rounded-2xl shadow-2xl`.
- Section type list inside the dialog: each option is a clickable card with icon + label + 1-line description. Hover: `bg-lp-surface-hover`. Selected: `border-lp-orange`.
- Primary "Add" button: `bg-lp-orange text-white`. Cancel: `text-lp-text-secondary hover:text-lp-text`.

When Phase 2 lands, "Channel list" will be added to this list. For now keep the existing options.

**Commit:** `feat(rider-pack): new section dialog backdrop blur + polish`

---

## Phase 1 acceptance gate

Before proceeding to Phase 2, all of these must be true:

- [ ] Typing in any field never freezes the UI (try a 50-character paragraph in a long-text field — should be smooth).
- [ ] Reordering sections still triggers a refresh and re-renders correctly.
- [ ] Stat strip is 3 cards, Bug-Reports-style.
- [ ] Share button is orange-primary, Export is outline-secondary.
- [ ] Pills render visible backgrounds (not the broken transparent state).
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.

If any are red, fix before starting Phase 2.

---

# PHASE 2 — R10: channel list section type

**Goal:** Add a structurally distinct `channel_list` section type with drag-to-reorder rows, sub-snake hierarchy, mic library with phantom auto-suggest, and provider field. This is the biggest single piece of work in the rider pack rebuild.

**Files touched in Phase 2:**
- `supabase/migrations/<timestamp>_channel_list.sql` (create)
- `src/lib/rider-packs/channel-list.ts` (create — CRUD)
- `src/lib/rider-packs/mic-library.ts` (create — read helper)
- `src/lib/rider-packs/types.ts` (modify — extend section types)
- `src/components/rider-pack/ChannelListEditor.tsx` (create)
- `src/components/rider-pack/SubSnakeDialog.tsx` (create)
- `src/components/rider-pack/PackEditor.tsx` (modify — dispatch by section_type)
- `src/components/rider-pack/NewSectionDialog.tsx` (modify — add option)
- `src/lib/rider-packs/resolve.ts` (modify — load channel rows + sub-snakes)

**One new dependency allowed in Phase 2:** `@dnd-kit/core` and `@dnd-kit/sortable` for drag-to-reorder. If these are already in `package.json`, use them; do not duplicate. If absent, add via `pnpm add @dnd-kit/core @dnd-kit/sortable`.

---

## Step 8 — Migration

Create `supabase/migrations/<timestamp>_channel_list.sql`. Use a real timestamp (`YYYYMMDDHHMMSS`).

```sql
-- Extend section_type enum
ALTER TYPE rider_pack_section_type ADD VALUE IF NOT EXISTS 'channel_list';

-- Mic library (workspace-shared reference data; seeded from real channel list)
CREATE TABLE IF NOT EXISTS mic_library (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,  -- NULL = global default seed
  name         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('dynamic','condenser','ribbon','di_active','di_passive')),
  default_phantom boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mic_library_workspace_idx ON mic_library(workspace_id);

-- Sub-snakes (per pack-section)
CREATE TABLE IF NOT EXISTS sub_snakes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES rider_pack_sections(id) ON DELETE CASCADE,
  label       text NOT NULL,
  colour      text NOT NULL,                     -- hex, e.g. '#3B82F6'
  position    integer NOT NULL DEFAULT 0,        -- display order in sub-snake dropdown
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_snakes_section_idx ON sub_snakes(section_id);

-- Channel list rows
CREATE TABLE IF NOT EXISTS channel_list_rows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         uuid NOT NULL REFERENCES rider_packs(id) ON DELETE CASCADE,
  section_id      uuid NOT NULL REFERENCES rider_pack_sections(id) ON DELETE CASCADE,
  row_index       integer NOT NULL,              -- 1-based; this is the channel #
  channel_name    text NOT NULL DEFAULT '',
  sub_snake_id    uuid REFERENCES sub_snakes(id) ON DELETE SET NULL,
  stage_box       text NOT NULL DEFAULT '',      -- e.g. 'SB1' / 'SB2'
  position        text NOT NULL DEFAULT '',      -- free text, autocomplete
  mic             text NOT NULL DEFAULT '',
  mic_substitute  text NOT NULL DEFAULT '',
  di              text NOT NULL DEFAULT '',
  stand           text NOT NULL DEFAULT '',
  phantom_power   boolean,                       -- nullable: NULL = unset / not applicable
  provider        text CHECK (provider IS NULL OR provider IN ('band','venue','hire')),
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, row_index)
);

CREATE INDEX IF NOT EXISTS channel_list_rows_section_idx ON channel_list_rows(section_id, row_index);

-- RLS: same pattern as rider_packs (owner via workspace membership)
ALTER TABLE sub_snakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_list_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE mic_library ENABLE ROW LEVEL SECURITY;

-- Replace these policies with the project's existing pack-membership helper if one exists.
CREATE POLICY "sub_snakes are accessible via pack membership" ON sub_snakes
  FOR ALL USING (
    pack_id IN (SELECT id FROM rider_packs WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "channel_list_rows are accessible via pack membership" ON channel_list_rows
  FOR ALL USING (
    pack_id IN (SELECT id FROM rider_packs WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "mic_library is readable by workspace members" ON mic_library
  FOR SELECT USING (
    workspace_id IS NULL
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mic_library is writable by workspace members" ON mic_library
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
```

**Important:** before writing the policies, search for an existing helper function like `is_pack_member(pack_id)` or `current_workspace_member()`. If one exists, use it instead of inlining the subquery. Do not invent new helpers.

Seed the mic library with these entries (insert via the migration with `workspace_id = NULL` so they're global defaults):

| name | type | default_phantom |
|---|---|---|
| Beta 91A | condenser | true |
| Beta 52A | dynamic | false |
| SM57 | dynamic | false |
| SM58 | dynamic | false |
| Beta 56A | dynamic | false |
| Beta 98A | condenser | true |
| KM184 | condenser | true |
| C414 | condenser | true |
| Radial JDI | di_passive | false |
| Radial J48 | di_active | true |
| Sennheiser e604 | dynamic | false |
| Sennheiser e609 | dynamic | false |

Run the migration and verify in Supabase: `SELECT * FROM mic_library;` returns the seeds.

**Commit:** `feat(rider-pack): channel list migration + mic library seed`

---

## Step 9 — Types + section dispatch plumbing

In `src/lib/rider-packs/types.ts`:

- Extend `SectionType` union with `'channel_list'`.
- Add types:

```ts
export type SubSnake = {
  id: string;
  pack_id: string;
  section_id: string;
  label: string;
  colour: string; // hex
  position: number;
};

export type ChannelListRow = {
  id: string;
  pack_id: string;
  section_id: string;
  row_index: number;
  channel_name: string;
  sub_snake_id: string | null;
  stage_box: string;
  position: string;
  mic: string;
  mic_substitute: string;
  di: string;
  stand: string;
  phantom_power: boolean | null;
  provider: 'band' | 'venue' | 'hire' | null;
  notes: string;
};

export type Provider = 'band' | 'venue' | 'hire';

export type MicLibraryEntry = {
  id: string;
  name: string;
  type: 'dynamic' | 'condenser' | 'ribbon' | 'di_active' | 'di_passive';
  default_phantom: boolean;
};
```

In `src/lib/rider-packs/resolve.ts` (`resolvePack`): for any section with `section_type === 'channel_list'`, also load its `sub_snakes` and `channel_list_rows` (ordered by `row_index ASC`). Attach them to the resolved section as `subSnakes` and `rows`.

**Commit:** `feat(rider-pack): channel list types + resolve loading`

---

## Step 10 — `channel-list.ts` and `mic-library.ts` data layer

Create `src/lib/rider-packs/channel-list.ts` with these functions (all take a Supabase client):

```ts
listSubSnakes(supabase, sectionId): Promise<SubSnake[]>
createSubSnake(supabase, { packId, sectionId, label, colour }): Promise<SubSnake>
updateSubSnake(supabase, id, patch): Promise<void>
deleteSubSnake(supabase, id): Promise<void>   // sets sub_snake_id to NULL on rows via FK ON DELETE SET NULL

listRows(supabase, sectionId): Promise<ChannelListRow[]>
appendRow(supabase, { packId, sectionId }): Promise<ChannelListRow> // computes next row_index
updateRow(supabase, id, patch): Promise<void>
deleteRow(supabase, id): Promise<void>         // does NOT renumber; instead, gaps in row_index are filled on the next reorder
reorderRows(supabase, sectionId, orderedIds): Promise<void>  // reassigns row_index 1..N in a transaction
```

`reorderRows` must be transactional (Supabase RPC with a SQL function, OR client-side fetch all rows → compute new indices → batch update with a single `upsert`). Document which approach you took in a comment.

Create `src/lib/rider-packs/mic-library.ts`:

```ts
listMics(supabase, workspaceId): Promise<MicLibraryEntry[]>  // returns workspace mics + global (workspace_id IS NULL)
createMic(supabase, { workspaceId, name, type, default_phantom }): Promise<MicLibraryEntry>
```

**Commit:** `feat(rider-pack): channel list + mic library data layer`

---

## Step 11 — Sub-snake palette + dialog

Create `src/components/rider-pack/SubSnakeDialog.tsx`. Modal (same backdrop pattern as NewSectionDialog).

Palette (used to auto-assign colour to new sub-snakes — pick the next index that isn't already in use, then wrap):

```ts
const SUB_SNAKE_PALETTE = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange (different from brand)
  '#84CC16', // lime
];
```

Dialog content:

- List of existing sub-snakes for this section. Each row: colour swatch (clickable → palette picker), label (editable inline), delete button.
- "Add sub-snake" button at bottom: creates with next palette colour, label "New sub-snake", focuses the label for inline edit.
- Custom colour: clicking the swatch opens a small palette grid plus a hex input.

Save behaviour: every change debounced through `useDebouncedSave` (label edits) or immediate (colour, add, delete).

**Commit:** `feat(rider-pack): sub-snake management dialog`

---

## Step 12 — `ChannelListEditor` — table shell + drag-to-reorder

Create `src/components/rider-pack/ChannelListEditor.tsx`. This is the core of Phase 2.

**Layout:**

```
┌─ container: rounded-xl border border-lp-border bg-lp-surface overflow-hidden ─┐
│                                                                                │
│  ┌─ header row: sticky, bg-lp-surface, border-b border-lp-border ───────┐   │
│  │  #  │ Channel name │ Sub-snake │ Stage box │ Position │ Mic │ ⋮     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│  ┌─ row: group, hover:bg-lp-surface-hover, border-b border-lp-border-light ┐│
│  │ │← 4px coloured stripe (sub-snake colour, or transparent)               ││
│  │ │  1  │ Kick In      │ [Drum sub] │ SB1 │ Stage R │ Beta 91A │ ⋮       ││
│  │ └────────────────────────────────────────────────────────────────────────┘│
│  │  ... more rows ...                                                       │
│                                                                                │
│  ┌─ footer ──────────────────────────────────────────────────────────────┐ │
│  │  [+ Add channel]              [Manage sub-snakes]                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Critical behaviours:**

1. **Channel `#` is a fixed row index.** It displays `row_index` and is **never editable**. Dragging row 5 to position 3 reassigns row_indices 1..N — the *content* moves, the slot numbers stay 1,2,3,4,5. The `#` cell shows `row_index` directly.

2. **Drag-to-reorder via dnd-kit.** Each row is a `useSortable` item. The drag handle is the `#` cell (or a small grip icon to its left, visible only on hover). On drop, call `reorderRows(supabase, sectionId, newOrder)`. Optimistic update local state immediately.

3. **Inline editing.** Every cell except `#` is editable in place. Enter / Tab moves to next field. Esc cancels. Saves are debounced via `useDebouncedSave` (per-row).

4. **Sub-snake column.** Renders as a pill with the sub-snake's colour (background `{colour}1a`, border `{colour}33`, text `{colour}`). Click → small dropdown listing sub-snakes + "None" + "Manage…" (opens `SubSnakeDialog`). Selecting a sub-snake updates `sub_snake_id` and re-renders the left-edge stripe.

5. **Left-edge stripe.** A 4px-wide div on the left of each row, `background: <sub_snake.colour>` or `transparent` if no sub-snake.

6. **Mic combobox.** Searchable list from `listMics`. On select, set `mic` AND auto-set `phantom_power` from the entry's `default_phantom`. If the user has explicitly set `phantom_power` (i.e. `phantom_power IS NOT NULL` already), do not overwrite it. Free-typing a mic name not in the library is allowed; phantom stays as-is.

7. **Phantom column** (rendered in the row's secondary detail expand — see Step 13) is a 3-state cell: `+48V` / `—` / `unset`. Clicking cycles through states. Auto-suggest from mic only changes the value when the field is currently `unset` OR the user is selecting a mic for the first time on that row.

8. **Provider column** (also in secondary detail) is a dropdown: Band / Venue / Hire / —. Below it, helper text: `"Applies to mic / DI only — not stand or cable."` This text must be visible to the user when the dropdown is open or when the field is empty. Use `text-xs text-lp-text-tertiary mt-1`.

9. **Position autocomplete** via a `<datalist>` or a simple combobox with these suggestions: `USR`, `USL`, `USC`, `DSC`, `DSL`, `DSR`, `OSR`, `OSL`, `DLS`, `FOH`. Free-typing other values is allowed.

10. **Add channel** button appends a row with the next `row_index`, focuses `channel_name` for input.

11. **Row actions menu** (`⋮` on hover): Duplicate / Delete. Duplicate inserts a copy at `row_index + 1` and bumps subsequent indices.

**Commit:** `feat(rider-pack): channel list editor with drag-to-reorder`

---

## Step 13 — Row detail expansion (secondary fields)

The at-rest row shows the high-traffic columns: # / Channel name / Sub-snake / Stage box / Position / Mic / Actions.

Less-frequent fields go in an expandable detail row revealed by clicking a chevron in the channel name cell (or hitting Enter on the row when focused). The expansion appears below the row:

- Mic substitute
- DI
- Stand
- Phantom power (3-state cell — see Step 12 #7)
- Provider (dropdown + helper text — see Step 12 #8)
- Notes (long text)

Layout: 2-column grid of label/value pairs, padded `px-12 py-3` to indent under the parent row, `bg-lp-bg` (slightly darker than row background) so the expansion is visually distinguished.

Persist expansion state in component state only (does not survive reload — fine for v1).

**Commit:** `feat(rider-pack): channel row detail expansion`

---

## Step 14 — Hook channel list into PackEditor + NewSectionDialog

In `src/components/rider-pack/PackEditor.tsx`:

- Add a section dispatcher: when rendering a section, switch on `section.section_type`. For `channel_list`, render `<ChannelListEditor section={section} pack={pack} onChange={...} />`. For others, keep the existing field-list renderer.
- Pass through pack-level handlers (refresh, etc.) but make sure `ChannelListEditor` does its own debounced saves and only calls `refresh` on add-row / delete-row / reorder (since those change the section's row count, which the stat strip displays).

In `src/components/rider-pack/NewSectionDialog.tsx`:

- Add "Channel list" to the section type options. Icon: a small list/grid SVG. Description: `"Inputs and routing — drag to reorder, sub-snakes, mics, phantom, provider."`.
- When selected, the new section is created with `section_type: 'channel_list'` and a default title of "Input channels" — but keep the title editable.

**Commit:** `feat(rider-pack): wire channel list into pack editor and section dialog`

---

## Step 15 — Smoke tests + acceptance

Before declaring Phase 2 done:

- [ ] Create a new pack. Add a channel list section. Add 5 channels. Reorder them by dragging. Confirm row indices stay 1-5 after each drop.
- [ ] Create 2 sub-snakes ("Drum sub" blue, "Bass sub" amber). Assign channels to each. Confirm left-edge stripes render correctly.
- [ ] Pick "Beta 91A" from the mic combobox on a row where phantom is unset. Confirm phantom auto-flips to `+48V`. Pick "SM58" on the next row — phantom stays/becomes `—`.
- [ ] Set Provider on a row to "Hire". Confirm helper text "Applies to mic / DI only…" is visible.
- [ ] Reload the page. Confirm everything persists: row order, sub-snake assignments, mic, phantom, provider, all secondary fields.
- [ ] Type a long sentence in Notes. Confirm no UI freeze (Phase 1 fix is still working).
- [ ] Delete a sub-snake. Confirm rows previously assigned to it now show no stripe (sub_snake_id became NULL).
- [ ] Delete the channel list section. Confirm cascade delete: `channel_list_rows` and `sub_snakes` for that section are gone.
- [ ] `pnpm typecheck` and `pnpm build` both pass.

**Commit:** `test(rider-pack): channel list smoke checks pass`

---

## Final acceptance gate

- All Phase 1 acceptance bullets still pass (regression check).
- All Phase 2 acceptance bullets pass.
- No new console warnings or errors in the browser.
- No new RLS errors in Supabase logs.

If any are red, fix before reporting done.

---

## Out of scope for this prompt (do NOT do)

- Output lists (stage outs / FOH outs) — that's R11.
- Derived inventory panel — that's R12.
- Backline hire list section — that's R13.
- Templates system — that's R14.
- Share-link tracking — that's R15.
- Attachments — that's R16.
- Stage plot builder — far future.
- Renaming or restructuring any non-rider-pack feature.
- Changing tokens, theme, or global CSS (use what exists).

If any of these come up while working, leave a `// TODO(R{n}):` comment and move on.
