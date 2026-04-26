# UX06 — `<SpreadsheetGrid>` Component

> The most novel and highest-risk component in the overhaul. **Greenfield grid** with keyboard-driven cell editing, frozen panes, multi-cell selection, and bulk edit. Replaces the current Budget page's "basic HTML" feel with something that holds its own against Excel.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 3.4 (Spreadsheet archetype).
2. `docs/design-tokens.md` (UX01).
3. `docs/components/DATA_TABLE_CONTRACT.md` (UX05). SpreadsheetGrid is **not** DataTable. Different use case, different mental model. Don't confuse them.
4. `src/app/(app)/bugs/page.tsx` + `src/components/bug-report/BugReportsClient.tsx` — visual aesthetic baseline. The user has explicitly said the spreadsheet must look like Bug Reports, **not** the current ugly Budget.
5. UX02–UX05 (must be merged).

---

## 1. Why this prompt exists

The current Budget page has been called "ugly", "basic HTML", "mad ugly", and functions worse than the user's existing spreadsheets. The user wants Lowpass spreadsheet pages (Budget, Payroll, Channel List, Routing) to **feel as good as or better than Excel/Google Sheets** for fast data entry, while looking premium like Bug Reports.

This is one component, used by four pages later (UX14, UX15). Get it right once.

---

## 2. Hard rules

1. **No new dependencies.** No `@tanstack/react-table`, no `ag-grid`, no `react-data-grid`. Build from scratch. The user has approved this scope.
2. **Aesthetic parity with Bug Reports**, not the current Budget. Premium, modern, restrained. Use design tokens religiously.
3. **Three densities**: comfortable / compact / tight (use `--lp-row-comfortable|compact|tight`).
4. **Keyboard-first.** Tab/Enter/arrow-key navigation must feel native. No mouse-only interactions for any common edit.
5. **Frozen panes** — first column always; header row always; optionally additional pinned rows (totals).
6. **Multi-cell selection** with Shift+arrow extending. Drag-select with mouse.
7. **Bulk edit**: select range, type a value, press Enter → fills all selected cells (with type validation per column).
8. **Cell types**: text, number (with formatting), currency, date, percent, select, checkbox, formula-readonly. No formula authoring in v1.
9. **Editing model**: cell is either in **navigate mode** (arrow keys move, Enter edits) or **edit mode** (typing replaces, Escape cancels, Enter commits + moves down, Tab commits + moves right).
10. **Validation per column**: number columns reject non-numeric input; date columns parse common formats. Invalid input shows inline error tooltip.
11. **Optimistic updates**: edits commit immediately to client state; consumer wires up `onCommitCell` to persist server-side. Errors revert.
12. **No paste-from-Excel in v1.** User explicitly de-prioritised this in Round 7 (didn't pick it). Document as a v2 feature.
13. **No formulas in v1.** System computes totals; consumer passes computed total rows.
14. **Lint + typecheck clean.** Build not run.

---

## 3. API

File: `src/components/spreadsheet-grid/SpreadsheetGrid.tsx`

```ts
type CellType =
  | { kind: 'text'; multiline?: boolean }
  | { kind: 'number'; min?: number; max?: number; decimals?: number }
  | { kind: 'currency'; currency: string; decimals?: number } // currency = ISO code
  | { kind: 'percent'; decimals?: number }
  | { kind: 'date'; format?: 'short' | 'long' }
  | { kind: 'select'; options: Array<{ value: string; label: string; color?: string }> }
  | { kind: 'checkbox' }
  | { kind: 'computed'; render: (row: any) => ReactNode } // readonly, no edit
  | { kind: 'entityRef'; entity: 'person' | 'flight' | 'room' | 'gear' | 'show' }; // pickable from entity registry — wires to UX08

type GridColumn<T> = {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => unknown);
  type: CellType;
  width?: number; // px; default 160
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean; // default true
  frozen?: boolean; // pin to left edge
  align?: 'left' | 'right' | 'center';
  sticky?: 'left' | 'right'; // for action columns
  validator?: (value: unknown, row: T) => string | null; // return error message or null
  onCommit?: (row: T, value: unknown) => Promise<T>; // returns updated row
};

type GridRow<T> = {
  id: string;
  data: T;
  isPinnedTop?: boolean;
  isPinnedBottom?: boolean; // e.g. totals row
  className?: string;
  computed?: boolean; // entire row is read-only (e.g. derived rows from canonical entities)
};

type SpreadsheetGridProps<T> = {
  columns: GridColumn<T>[];
  rows: GridRow<T>[];
  density?: 'comfortable' | 'compact' | 'tight';

  // Section header rows (e.g. "Hotels" / "Travel" within Budget)
  sectionHeaders?: Array<{ afterRowId: string | null; label: string; collapsible?: boolean }>;

  // Selection
  onSelectionChange?: (range: SelectionRange) => void;

  // Editing
  onCommitCell?: (rowId: string, columnId: string, value: unknown) => Promise<void>;
  onBulkEdit?: (rowIds: string[], columnId: string, value: unknown) => Promise<void>;

  // Row interaction (slide-over for context)
  onRowOpen?: (row: T) => void; // triggered by Cmd/Ctrl+. or right-click → "Open context"

  // Layout
  containerHeight?: string; // default '100%'

  // ARIA
  ariaLabel?: string;
};

type SelectionRange = {
  startRowId: string;
  endRowId: string;
  startColumnId: string;
  endColumnId: string;
};
```

---

## 4. Visual contract

**Bug Reports aesthetic, not current Budget.** Specifically:

- Header row: `--lp-surface` background, `--lp-table-header-text`, weight 600, `--lp-text-xs` size, `--lp-tracking-caps` letter spacing, uppercase, sticky top
- Frozen first column: `--lp-bg`, sticky left, right border slightly heavier (`--lp-border` not `--lp-border-light`)
- Cell padding: `var(--lp-row-cell-padding-y-{density}) var(--lp-row-cell-padding-x)`
- Cell borders: 1px `--lp-border-light` between cells
- Cell hover: subtle background `--lp-surface-hover`
- Cell focused (navigate mode): 2px `--lp-orange` ring inset, no background change
- Cell editing (edit mode): white/`--lp-bg` background, brand-orange 1px border, slightly elevated shadow `--lp-shadow-xs`
- Cell selected (multi): brand-orange at low alpha (`#FF45000d`) background
- Currency cells: tabular-nums, right-aligned, format with thousand separators; negative values in `--lp-error`
- Date cells: format per `format` prop (short = "12 Aug 26", long = "Wed 12 Aug 2026")
- Section header row: spans all columns, weight 600, slight uppercase, `--lp-bg-tertiary` background, collapse caret on the left
- Pinned bottom row (totals): `--lp-surface` background, weight 600, top border 2px `--lp-border`
- Computed row: `--lp-bg-secondary` background, italic, link icon at start of first cell

Density rules:
- `comfortable`: 44px row, larger gaps
- `compact`: 32px row (default for power-grid)
- `tight`: 28px row (Budget's default — maximises rows on screen)

Font: `--font-mono` for number/currency/percent cells (tabular-nums); `--font-sans` for text/select.

---

## 5. Behaviour

### 5.1 Cell modes

- **Navigate**: arrow keys move active cell; selected range follows. Active cell shown with orange inset ring.
- **Edit**: triggered by typing (replaces value), F2 or Enter (preserves value, cursor at end). Escape cancels. Enter commits + moves down. Tab commits + moves right. Shift+Enter / Shift+Tab go opposite.

### 5.2 Selection

- Click cell → single cell selected
- Shift+click → extend rectangular range
- Click + drag → rectangular range
- Cmd/Ctrl+click on a cell does nothing in v1 (multi-disjoint not supported)
- Shift+arrow → extend range
- Cmd/Ctrl+A → select entire grid (first press) / column (subsequent)

### 5.3 Bulk edit

When a range is selected and the user types a character: enter edit mode on the **first cell of the range**. Show a "Apply to selection" hint at the bottom-right of the editing cell. On Enter:
- If range was 1×1: commit and move down (normal edit)
- If range was multi-cell: call `onBulkEdit(rowIds, columnId, value)`. Apply to all cells. If columns differ across the range, show an inline error and refuse the bulk edit.

### 5.4 Row context

- Right-click row → context menu with "Open context" (calls `onRowOpen`), "Delete", "Duplicate", and any consumer-supplied `rowActions`.
- `Cmd/Ctrl+.` on a focused cell calls `onRowOpen` for that row.

### 5.5 Computed rows

Cells in a `computed: true` row are read-only. Editing attempts show a tooltip "Derived from <source>" and refuse. Used for canonical-entity-derived rows (UX09–UX12).

### 5.6 Error handling

- Inline validation: invalid input → red ring around cell, tooltip with error text.
- Commit failure (server-side): cell flashes red, value reverts, toast at bottom-right.

### 5.7 Performance

For grids up to 5,000 rows × 30 columns, must remain responsive: <100ms for typical edit, <200ms for bulk edit on 100 rows. Use windowing (virtualised rendering) — render only visible rows + 10 row buffer above/below.

### 5.8 Accessibility

- `role="grid"` on root, `role="row"` on rows, `role="gridcell"` on cells
- `aria-rowindex`, `aria-colindex` on cells
- Active cell has `aria-current="true"`
- Selection announced via `aria-live="polite"` region

---

## 6. File structure

```
src/components/spreadsheet-grid/
├── SpreadsheetGrid.tsx        // main component, composes the others
├── GridHeader.tsx             // sticky header row, column resize handles
├── GridBody.tsx                // virtualised rows
├── GridRow.tsx                 // single row
├── GridCell.tsx                // single cell — handles navigate/edit modes
├── GridSectionHeader.tsx       // collapsible section divider
├── GridPinnedRow.tsx           // totals / sticky rows
├── cell-editors/
│   ├── TextEditor.tsx
│   ├── NumberEditor.tsx
│   ├── CurrencyEditor.tsx
│   ├── PercentEditor.tsx
│   ├── DateEditor.tsx
│   ├── SelectEditor.tsx
│   ├── CheckboxEditor.tsx
│   └── EntityRefEditor.tsx
├── hooks/
│   ├── useGridSelection.ts
│   ├── useGridKeyboard.ts
│   ├── useGridVirtualisation.ts
│   └── useGridEditing.ts
├── types.ts
└── utils/
    ├── format.ts              // currency/percent/date formatters
    ├── parse.ts               // input parsers per cell type
    └── validate.ts             // column validators
```

---

## 7. Steps

### Step 1 — Types + utilities

Build `types.ts`, `utils/format.ts`, `utils/parse.ts`, `utils/validate.ts`. Pure functions, fully tested-by-eyeball.

### Step 2 — Single cell

Build `GridCell.tsx` + a single editor (TextEditor) end-to-end. Test in playground with one cell.

### Step 3 — Row + column

Add `GridRow.tsx`, header row, selection of one cell at a time. Test 5×5 grid.

### Step 4 — Keyboard navigation

Add `useGridSelection`, `useGridKeyboard`. Get arrow / Tab / Enter / Escape working perfectly across the 5×5.

### Step 5 — Multi-cell selection + bulk edit

Add Shift+arrow, drag-select, bulk edit flow.

### Step 6 — Frozen panes

Add frozen first column + sticky header. Test horizontal + vertical scroll.

### Step 7 — All editor types

Add the remaining editors: number, currency, percent, date, select, checkbox, entityRef (entityRef can stub-render until UX08 lands — render the entity ID as text, log a TODO).

### Step 8 — Section headers + pinned rows

Add collapsible section headers and pinned bottom rows.

### Step 9 — Virtualisation

Add `useGridVirtualisation`. Test with 5,000-row mock dataset; profile.

### Step 10 — Playground

Create `src/app/(app)/admin/spreadsheet-playground/page.tsx`. Three demos:
1. **Budget mock** — 200 rows × 10 columns, multi-section, currency + computed totals row, tight density. The user will visually compare this against the current Budget page; it must feel obviously better.
2. **Payroll mock** — 30 rows × 12 columns, mixed types, comfortable density.
3. **Channel list mock** — 50 rows × 8 columns including entityRef columns (mic, gear).

Demo 1 has the highest aesthetic bar — make sure it visibly outclasses the current Budget.

---

## 8. Step 11 — Contract doc

Create `docs/components/SPREADSHEET_GRID_CONTRACT.md`:

- When to use (Budget, Payroll, Channel List, Routing)
- When NOT to use (lists → DataTable; documents → DocumentCanvas)
- Cell type catalogue with examples
- Keyboard cheatsheet (full table of shortcuts)
- The bulk-edit rule
- Server commit pattern (`onCommitCell`)
- Anti-patterns:
  - Don't put SpreadsheetGrid inside SlideOver (it needs space)
  - Don't render more than ~5,000 rows; paginate at the API
  - Don't add formulas (defer to v2)
  - Don't use SpreadsheetGrid for read-only data; use DataTable

---

## 9. Verification

1. `npm run lint`, `npm run typecheck` clean
2. `/admin/spreadsheet-playground` works
3. Demo 1 visibly beats `/tours/[id]/budget` aesthetically
4. Keyboard: arrow / Tab / Enter / Escape / F2 / Shift+arrow all behave correctly
5. Bulk edit: select 10 cells in same column, type "100", Enter → all 10 update
6. Bulk edit across mixed columns → refused with inline error
7. Frozen first column stays put on horizontal scroll
8. Sticky header stays put on vertical scroll
9. 5,000-row demo renders in <200ms, scroll is smooth
10. Computed rows reject edits with tooltip
11. Currency cells format with separators and right-align
12. Dark mode parity

---

## 10. Acceptance criteria

- [ ] All files under `src/components/spreadsheet-grid/` exist
- [ ] All cell editor types implemented except formulas (out of scope) and EntityRef (stubbed)
- [ ] Keyboard navigation matches §5.1
- [ ] Multi-cell selection + bulk edit works
- [ ] Frozen panes work
- [ ] Section headers + pinned rows work
- [ ] Virtualisation handles 5,000 rows smoothly
- [ ] Playground page demonstrates all three demos
- [ ] Contract doc written
- [ ] Aesthetic parity with Bug Reports (verified visually)
- [ ] No new dependencies
- [ ] Lint + typecheck clean

---

## 11. Out of scope

- ❌ Paste-from-Excel (defer to v2)
- ❌ Formulas (defer to v2)
- ❌ Column reordering (defer)
- ❌ Multi-disjoint selection (defer)
- ❌ Server-side virtualisation (defer)
- ❌ Migrating Budget / Payroll / Channel List / Routing to use this — UX14 / UX15 do that
- ❌ Wiring real EntityRef cells — UX08 builds the EntityChip system

---

## 12. Commit plan

Two or three commits to keep the diff manageable:

1. `UX06: SpreadsheetGrid — types, utils, single cell, navigation`
2. `UX06: SpreadsheetGrid — selection, bulk edit, frozen panes, virtualisation`
3. `UX06: SpreadsheetGrid — playground + contract doc`
