# CC Sprint — Density Propagation + Channel List Quick Fixes

Two related polish targets bundled into one sprint:

1. **§B5 redux:** Propagate Budget's new density modes (Compact / Comfortable / Cozy) to the Equipment and Personnel grids on the migrated workspace dashboard chrome. Closes the visual consistency loop across the three big workspace grids.
2. **Channel list quick fixes:** Three concrete pain points Adam flagged: can't add new channels, partial tab navigation, no routing matrix for patching a whole stage box at once.

Sub-phases run in order, each its own commit, halt-and-report at 400 LOC.

**Baseline assumption:** Both `feat/ia-cleanup` and `feat/budget-phase-b4-density` have been merged to main. Density tokens exist in `globals.css`. Workspace dashboard tabs (Artists / Personnel / Equipment) exist via `(workspace)` route group. The `BudgetDensityContext` + `BudgetDensityToggle` components are reference implementations for the density propagation work.

**Branch:** `feat/polish-sprint-1` off main.

---

## Hard rules

1. **One feature commit per sub-phase.** Halt-and-report at ~400 LOC.
2. **Lint baseline does not regress.** `tsc --noEmit` zero. `next build --webpack` green.
3. **No new deps.** Density propagation reuses Budget's pattern. Channel list fixes touch only existing components.
4. **Token discipline.** All visual values via `var(--lp-…)`. Density tokens already exist in globals.css — use them.
5. **Verify before claiming.** File:line precision in every report.
6. **Out of scope:** Payroll product build, Rooming product build, Rider editor rebuild, Phase B.5 (Budget grid migration), Phase C (data frontloading). All queued for later sprints.

---

# §B5 — Density propagation to Equipment + Personnel grids

The density system shipped with Budget §B4. Three density modes (Compact / Comfortable / Cozy) with full scaling — row height, padding, font size, numeric size, indicator size. Tokens already defined in `globals.css`. Now propagate to the other two big grids that share design DNA with Budget.

## Recon first

Read the Budget reference implementation before touching Equipment/Personnel:
- `src/components/budget/BudgetDensityContext.tsx` — Provider + `useBudgetDensity` hook + SSR-safe hydration + localStorage persistence
- `src/components/budget/BudgetDensityToggle.tsx` — 3-button picker with brand-orange tint on active
- `src/components/budget/BudgetTabNav.tsx` — where the toggle mounts (far right of tab row)
- `src/components/budget/BudgetSpreadsheetView.tsx` — how `<Td>` consumes density via context + applies token-driven padding + font size + `data-density="X"` attribute

The pattern: Provider wraps the page → context exposes current density → cells consume context → CSS tokens drive visual scaling per density.

## B5.1 — Equipment grid

Equipment lives at `src/app/(app)/(workspace)/equipment/page.tsx` after §I3 migration. The grid component is mounted from there.

**Find the equipment grid component** — likely `src/components/equipment/InventoryTab.tsx` or `EquipmentClient.tsx`. Recon to confirm.

**Add the density system:**

1. **Create `src/components/equipment/EquipmentDensityContext.tsx`** — copy the structure of `BudgetDensityContext.tsx`. Differences:
   - localStorage key: `lowpass:equipment:density`
   - Hook name: `useEquipmentDensity`
   - Default density: Comfortable

2. **Create `src/components/equipment/EquipmentDensityToggle.tsx`** — copy the structure of `BudgetDensityToggle.tsx`. Should be visually identical (3-button picker, brand-orange tint on active).

3. **Wrap the equipment page in `<EquipmentDensityProvider>`** at `(workspace)/equipment/page.tsx`.

4. **Mount the toggle UI** in the equipment header. If the equipment page has a tab nav or filter bar at the top, place the toggle at the far right (same position as Budget). If no such header exists, add a thin header row above the grid.

5. **Equipment grid cells consume density** via `useEquipmentDensity` and apply the same token-driven scaling as Budget cells. Specifically:
   - Row height: `var(--lp-row-height-${density})`
   - Cell padding-y: `var(--lp-row-cell-padding-y-${density})`
   - Font size: `var(--lp-cell-font-size-${density})` for text cells
   - Numeric cells (quantities, prices, day rates): `var(--lp-cell-numeric-size-${density})`
   - Indicator sizes (category badge, status pill): `var(--lp-cell-indicator-size-${density})`
   - `data-density="${density}"` attribute on rows for any CSS selectors that need it

6. **Reload persistence:** verify the choice survives a page reload via localStorage.

## B5.2 — Personnel grid

Same pattern. Personnel lives at `src/app/(app)/(workspace)/personnel/page.tsx` after §I3 migration.

**Find the personnel grid component** — likely `src/components/personnel/PersonnelGrid.tsx` or similar. Recon to confirm.

**Add the density system** mirroring B5.1:
- `PersonnelDensityContext.tsx` with localStorage key `lowpass:personnel:density`
- `PersonnelDensityToggle.tsx` mirroring the budget toggle
- Wrap personnel page in `<PersonnelDensityProvider>`
- Mount toggle in personnel header
- Personnel cells consume density via `usePersonnelDensity`

## B5.3 — Optional: extract a shared density primitive

If you find yourself copy-pasting the Provider + Toggle code for the third time (Equipment + Personnel + future grids), consider extracting a shared `createDensityContext(storageKey)` factory at `src/lib/density/createDensityContext.ts`. Recommended approach:

```ts
export function createDensityContext(storageKey: string, defaultDensity: Density = 'comfortable') {
  const Context = createContext<...>();
  function Provider({ children }) { /* same shape as BudgetDensityProvider */ }
  function useDensity() { /* same shape as useBudgetDensity */ }
  return { Provider, useDensity };
}
```

Then `BudgetDensityContext`, `EquipmentDensityContext`, `PersonnelDensityContext` all become 10-line files that call the factory.

**Don't do this refactor IF** it pushes the sub-phase past 400 LOC. Ship the copy-paste version first; refactor in a follow-up commit if time allows.

## §B5 reporting

```
Phase B5 done. Commit: <hash>
Files added:
  - src/components/equipment/EquipmentDensityContext.tsx
  - src/components/equipment/EquipmentDensityToggle.tsx
  - src/components/personnel/PersonnelDensityContext.tsx
  - src/components/personnel/PersonnelDensityToggle.tsx
  [- src/lib/density/createDensityContext.ts — only if extracted]
Files modified:
  - src/app/(app)/(workspace)/equipment/page.tsx (provider wrapping)
  - src/app/(app)/(workspace)/personnel/page.tsx (provider wrapping)
  - src/components/equipment/[grid component] (consume density)
  - src/components/personnel/[grid component] (consume density)
Verify: tsc=0, lint baseline, build green
Smoke:
  1. Visit /equipment — density toggle visible in header. Click each mode. Rows, padding, font, numeric size, indicator size all scale.
  2. Reload. Choice persists.
  3. Visit /personnel — same toggle visible. Same behaviour.
  4. Density choices are independent per surface (changing budget density doesn't affect equipment).
Blockers: [empty if clean]
```

Estimated LOC: ~150-250 with or without the shared factory.

---

# §CL1 — Channel list "add new channel" + remaining tab nav

Adam's bugs:

> "I actually like the channel list, theres issues (Cant add new channels) not all boxes are tab-nav, should add a routing matrix for stage boxes to make it quicker to patch a whole box etc)"

This sub-phase addresses (1) and (2). Routing matrix is §CL2.

## CL1.1 — Add new channel affordance

Recon `src/components/rider-pack/ChannelListEditor.tsx` and related components. The channel list lives inside a rider pack section.

Find where rows are listed. The current state per Adam: "Can't add new channels" — meaning either:
- The "+ Add channel" button doesn't exist
- The button exists but is broken (click does nothing)
- The button exists but is hidden/unreachable

Diagnose first. Report what's broken before fixing.

**Fix:**
- Add (or fix) the "+ Add channel" button. Place at the bottom of the input grid, just above the output sub-grid.
- Click creates a new `channel_list_rows` row with sensible defaults:
  - `row_kind = 'input'`
  - `row_index = max(existing) + 1`
  - All other fields null/empty
- Row appears immediately in the grid. Cursor focuses the Name cell of the new row so the user can start typing immediately.
- Auto-save via existing pattern.

**While there:**
- Same affordance for output rows: "+ Add output" button at the bottom of the output sub-grid (if not already present per §8b2).

## CL1.2 — Complete tab navigation coverage

§8b2 added the cell coordinate system + Tab/Shift+Tab/Enter/Esc/↑↓ handlers via `useCellNav`. Adam reports "not all boxes are tab-nav" — meaning some cells still escape the system.

**Recon:**
- Read `src/lib/hooks/useCellNav.tsx` to refresh on the coordinate system.
- Read `src/components/rider-pack/ChannelListEditor.tsx` and `src/components/rider-pack/channel-list-cells/OutputBlock.tsx` to find all cells.
- Identify which cells are wrapped in `<NavCell>` and which are not.

**Fix:**
- Wrap every editable cell in `<NavCell row={...} col={...}>`. Aggregates section cells too if any are editable.
- Verify the coordinate system handles wrapping at row boundaries correctly.
- Test: Tab from the very first cell of the input grid all the way through to the last cell of the output grid (or the last cell of the last aggregate row if those become editable). No focus drops.

**Specifically check:**
- Phantom toggle (3-state button) — Tab into / out of it should work
- Stage box select / Loom select / Cable Length select — all should accept Tab
- Mic/DI select — verify
- Provider chip — verify
- The new "+ Add channel" button from CL1.1 — also tabbable

## §CL1 reporting

```
Phase CL1 done. Commit: <hash>
Files modified:
  - src/components/rider-pack/ChannelListEditor.tsx
  - src/components/rider-pack/channel-list-cells/[any cells fixed]
  - [any API route if "+ Add channel" needed server changes]
Verify: tsc=0, lint baseline, build green
Pre-fix bug diagnosis: [what was actually broken about Add Channel]
Smoke:
  1. Open any channel list. Click "+ Add channel" — new row appears, cursor focuses Name cell. Type, blur — saves.
  2. Tab from row 1 col 1 all the way through input grid + output grid. No focus drops. Wrapping works at row boundaries.
  3. Shift+Tab reverse works the same.
Blockers: [empty if clean]
```

Estimated LOC: ~150-300 depending on how broken the add affordance was.

---

# §CL2 — Routing matrix for stage boxes

Adam's ask:

> "should add a routing matrix for stage boxes to make it quicker to patch a whole box etc"

Currently, to assign 16 inputs to a single stage box, the user has to edit the Stage Box column on each of 16 rows individually. Slow and tedious.

**Desired behaviour:** select a stage box → see a visual grid of that box's inputs (e.g. "Stage Box A — 16 inputs available") → drag/click to assign inputs to ports → done in one move.

## Design

**Trigger:** a "Patch box" button per stage box in the Stage Boxes inventory aggregate section. Click → modal opens with the routing matrix for that box.

**Modal layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Patch Stage Box A (16 ports)                       [×] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Port  Channel              Loom      Cable            │
│  1     [KICK IN ▾]          [A ▾]     [6' ▾]           │
│  2     [KICK OUT ▾]         [A ▾]     [6' ▾]           │
│  3     [SNARE TOP ▾]        [A ▾]     [6' ▾]           │
│  4     [SNARE BOT ▾]        [A ▾]     [6' ▾]           │
│  5     [— unused —]                                    │
│  ...                                                   │
│  16    [— unused —]                                    │
│                                                         │
│              [Cancel]  [Save patch]                    │
└─────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Each port row has: Channel dropdown (unassigned inputs in this list), Loom dropdown, Cable length dropdown.
- "Channel" dropdown lists every input row in the channel list that doesn't currently have a stage box assigned, plus any already assigned to THIS box (so they appear pre-selected).
- Selecting a channel for a port assigns that channel's `stage_box_id = <this box>` AND `stage_box_position = <this port number>`.
- Unselecting (picking "— unused —") clears the assignment.
- Loom + Cable Length dropdowns set the corresponding columns on the same channel.
- "Save patch" commits all changes in a single transaction. Cancel discards.

**Data model implications:**
- `channel_list_rows.stage_box_id` and `channel_list_rows.stage_box_position` already exist (verified in §8a).
- `stage_boxes.capacity` exists (default 16). The number of port rows = capacity.
- No schema changes needed.

**UI placement:**
- "Patch box" button next to each stage box row in the Stage Boxes aggregate section of `ChannelListAggregates.tsx`.
- The button could be a small chip "Patch" or an icon button.

## Implementation steps

1. Read `src/components/rider-pack/ChannelListAggregates.tsx` and `src/components/rider-pack/channel-list-cells/InventoryAggregates.tsx` to understand current stage box rendering.
2. Add a "Patch" button per stage box row.
3. Create `src/components/rider-pack/StageBoxPatchModal.tsx`:
   - Props: `stageBoxId`, `onClose`, `onSave`
   - Fetches the channel list rows currently assigned to this stage box + all unassigned input rows
   - Renders the port grid (capacity rows)
   - State management: local list of port → channel_row_id assignments, dirty flag
   - Save: PATCH each affected channel_list_row with the new stage_box_id / stage_box_position / loom / cable_length
   - Close: prompts if dirty

4. Wire the modal open/close via local state in ChannelListAggregates or a parent.

## §CL2 reporting

```
Phase CL2 done. Commit: <hash>
Files added: src/components/rider-pack/StageBoxPatchModal.tsx
Files modified:
  - src/components/rider-pack/ChannelListAggregates.tsx (Patch button + modal mount)
  - src/components/rider-pack/channel-list-cells/InventoryAggregates.tsx (if Patch button lives here instead)
  - [any API routes if bulk patch needed a new endpoint]
Verify: tsc=0, lint baseline, build green
Smoke:
  1. Open a channel list with at least one stage box (capacity 16).
  2. Find the Stage Boxes aggregate section. Click "Patch" next to the box.
  3. Modal opens with 16 port rows.
  4. Select channels for ports 1-4. Save. Confirm grid Input column updates: those rows show Stage Box A and ports 1-4.
  5. Re-open modal. Confirm previously-assigned rows are still selected. Change one. Save. Confirm change persists.
  6. Open modal, select an unused channel, click Cancel. Confirm no save happened.
Blockers: [empty if clean]
```

Estimated LOC: ~300-400 (the modal is the biggest piece).

If §CL2 exceeds 400 LOC, split: §CL2a (the modal UI + state management) and §CL2b (the bulk save + integration with grid refresh).

---

## Sprint summary

After all 3 sub-phases ship:

- **§B5:** density toggle on Equipment + Personnel grids. Three visual modes consistent across Budget / Equipment / Personnel.
- **§CL1:** "+ Add channel" works. Every channel list cell is tabbable.
- **§CL2:** stage box patching is a one-modal operation instead of 16 individual cell edits.

Total estimated LOC: ~600-900 across 3 commits. ~3-5 days of CC time.

Adam smokes each sub-phase incrementally. After all three ship + smoke green, merge `feat/polish-sprint-1` to main. Then next sprint starts: Payroll product build.

---

## Resume prompt for CC (after main has Phase B + IA Cleanup + B4 merged)

```
New sprint. Full spec in docs/handover/CC_DENSITY_PROPAGATION_AND_CHANNEL_LIST.md.

Branch: feat/polish-sprint-1 off main (after the Phase B + IA Cleanup + B4 merges land).

Three sub-phases in order:
  §B5 — density propagation to Equipment + Personnel grids
  §CL1 — channel list "+ Add channel" + remaining tab nav coverage
  §CL2 — routing matrix modal for patching whole stage boxes

Halt-and-report at 400 LOC per sub-phase. Each is its own commit. Standard report format: hash, files (path:line), verify (tsc/lint/build), smoke instructions for Adam, blockers.

Recon before each sub-phase. The Budget §B4 implementation at src/components/budget/BudgetDensityContext.tsx + BudgetDensityToggle.tsx is the reference for §B5 — copy the pattern (or extract a shared factory if the third copy-paste tempts you).

For §CL1, diagnose the "can't add new channels" bug BEFORE fixing. Report what was actually broken.

For §CL2, the routing matrix modal is the biggest new component — split into §CL2a/§CL2b if it overshoots 400 LOC.

Out of scope: Payroll, Rooming, Rider rebuild, Phase B.5, Phase C. All queued.
```
