# UX05 — `<DataTable>` Component

> First prompt of Phase B (component library). Builds the universal `<DataTable>` for the List archetype. **Replaces every existing table implementation in the codebase** going forward — no page is allowed to roll its own table after UX13.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 3.4 (List archetype), 5 (component library).
2. `docs/design-tokens.md` (UX01).
3. `docs/components/SLIDE_OVER_CONTRACT.md` (UX03).
4. `src/components/bug-report/BugReportsClient.tsx` — the visual baseline. The new `<DataTable>` should feel like Bug Reports' table.
5. UX02–UX04 (must be merged). PageShell + SlideOver exist.

---

## 1. Why this prompt exists

The app currently has multiple bespoke table implementations — Personnel, Files, Bugs, Tours, etc. They differ in spacing, sort behaviour, hover states, click affordances. Every new "list" page so far has invented its own.

`<DataTable>` is the single allowed list-render primitive. Once it exists, UX13 mass-migrates every list page onto it. After UX13, no page is permitted to roll its own table.

---

## 2. Hard rules

1. **No new dependencies.** No `@tanstack/react-table`, no `react-data-grid`. Build from scratch using React + Tailwind tokens. The user has already approved a heavyweight greenfield component (UX06 SpreadsheetGrid) — DataTable should be much simpler than that.
2. **Headless-first API.** Component takes column definitions and rows; renders them. No assumptions about data source.
3. **Two densities** out of the box: `comfortable` (default) and `compact`.
4. **Row click → SlideOver.** The contract is: `onRowClick(row) => void`. Consumer wires that to opening their slide-over with the row's data. DataTable doesn't manage the slide-over itself.
5. **Sort, filter, search, paginate** all built in. None of those features depend on a backend round-trip — they operate on the rows passed in. Server-side variants are out of scope for v1.
6. **Sticky header** — column header row stays visible on vertical scroll within the table's container.
7. **Frozen first column** opt-in via column def flag. Useful for wide tables.
8. **Keyboard navigation**: arrow keys move row focus; Enter triggers `onRowClick`; `/` focuses the search input.
9. **Selection** opt-in via column def flag (checkboxes in first column). Bulk actions exposed via `selectionActions` prop.
10. **Empty state** customisable via `emptyState` prop; default is "No results".
11. Use `--lp-row-comfortable` / `--lp-row-compact` for row heights from UX01.
12. Lint + typecheck clean. No build run.

---

## 3. API

File: `src/components/data-table/DataTable.tsx`

```ts
type ColumnDef<T> = {
  id: string;
  header: string | ReactNode;
  accessor: keyof T | ((row: T) => unknown);
  cell?: (value: unknown, row: T) => ReactNode; // optional render override
  sortable?: boolean;
  width?: number | string; // px, %, fr, etc
  minWidth?: number;
  align?: 'left' | 'right' | 'center'; // default left
  frozen?: boolean; // freeze this column to the left edge
  className?: string;
  filter?: ColumnFilter;
};

type ColumnFilter =
  | { kind: 'text' }
  | { kind: 'select'; options: Array<{ value: string; label: string }> }
  | { kind: 'multiSelect'; options: Array<{ value: string; label: string }> }
  | { kind: 'dateRange' }
  | { kind: 'numberRange' };

type DataTableProps<T> = {
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string; // unique id

  density?: 'comfortable' | 'compact'; // default 'comfortable'

  // Selection
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: ReactNode; // toolbar shown when selection > 0

  // Row interaction
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;

  // Search
  searchable?: boolean; // default true
  searchPlaceholder?: string; // default 'Search…'
  searchAccessor?: (row: T) => string; // what to search; default = stringify all visible columns

  // Pagination
  pageSize?: number; // default 50
  pagination?: 'paged' | 'infinite' | 'none'; // default 'paged'

  // Empty state
  emptyState?: ReactNode;

  // Sticky / layout
  stickyHeader?: boolean; // default true
  containerHeight?: string; // CSS height for the scroll container; default 'auto'

  // ARIA
  ariaLabel?: string;
};
```

---

## 4. Visual contract

Match the Bug Reports table aesthetic. Specifically:

- Header row: background `--lp-surface`, text `--lp-table-header-text`, weight 600, `--lp-text-xs` size, `--lp-tracking-caps` letter spacing, uppercase
- Cell padding: `var(--lp-row-cell-padding-y-{density}) var(--lp-row-cell-padding-x)`
- Row height: `--lp-row-{comfortable|compact}`
- Row hover: background `--lp-surface-hover`
- Row selected: background derived from `--lp-orange` at low alpha (`#FF45000d`)
- Borders between rows: 1px `--lp-border-light`
- Sort indicator: small chevron in header, brand-orange when active
- Search box: top-left of toolbar, full text input with magnifier icon, width 320px
- Toolbar height: 48px, contains search + filter chips + bulk actions
- Pagination footer: 40px height, "Showing X–Y of Z" left, page controls right

---

## 5. Behaviour spec

### 5.1 Sort

Click a sortable column header → toggle sort: none → asc → desc → none. Only one sorted column at a time (multi-sort is out of scope for v1). Sort happens client-side over the `rows` prop.

### 5.2 Filter

Each column with a `filter` def gets a chip in the toolbar. Click chip → opens a dropdown popover with the appropriate input(s). Active filters show their value in the chip. Clear filter via X on the chip.

### 5.3 Search

`/` key (when not in an input) focuses search. Searches across stringified visible-column values (or `searchAccessor` if provided). Debounced 150ms. Combines with active filters using AND.

### 5.4 Selection

When `selectable`, first column is checkbox. Header has a tri-state checkbox: checked / indeterminate / unchecked. Shift-click selects a range.

When `selectedIds.length > 0`, toolbar shows the count + `selectionActions` content.

### 5.5 Pagination

`paged`: footer with prev/next + page numbers. Shows pageSize per page.

`infinite`: scroll to bottom → load next chunk. Provide `onLoadMore` callback (consumer-driven; DataTable doesn't fetch).

`none`: render all rows, no pagination footer.

### 5.6 Keyboard

- `↑` / `↓`: move row focus
- `Enter` / `Space`: trigger `onRowClick(row)` for focused row
- `/`: focus search
- `Escape` (in search): clear and blur

### 5.7 Loading state

If consumer wants to show loading, they pass `rows={undefined}`. DataTable then renders a skeleton: 8 placeholder rows with shimmer.

### 5.8 Frozen column

If a column has `frozen: true`, it sticks to the left edge during horizontal scroll. Apply `position: sticky; left: 0; z-index: --lp-z-elevated;` and a right border to indicate the freeze line. Background is `--lp-bg` (so it covers scrolled-under columns).

---

## 6. File structure

```
src/components/data-table/
├── DataTable.tsx          // main component
├── DataTableHeader.tsx    // header row
├── DataTableRow.tsx       // body row
├── DataTableToolbar.tsx   // search + filter chips + bulk actions
├── DataTablePagination.tsx
├── DataTableFilterChip.tsx
├── DataTableEmpty.tsx
├── DataTableSkeleton.tsx
├── types.ts               // ColumnDef, DataTableProps, etc
└── utils.ts               // sort, filter, search helpers
```

---

## 7. Step 1 — Build the component

Implement every file above, fully typed, with the API and behaviour from §3–§5. Use design tokens for every visual value.

Make it generic over the row type with TypeScript: `function DataTable<T>(props: DataTableProps<T>)`.

---

## 8. Step 2 — Playground page

Create `src/app/(app)/admin/data-table-playground/page.tsx`, admin-gated.

Demo cases:
1. **Personnel** — 50 mock rows, columns: Name, Role, Email, Phone, Status. `selectable: true`, comfortable density, search enabled.
2. **Expenses** — 200 mock rows, columns: Date, Category, Description, Amount, Show. Compact density, sortable, filter by category.
3. **Tours** — 12 mock rows, columns: Name, Status, Start, End, Shows count. Frozen Name column, paged 10/page.
4. **Bug Reports** (mock) — 30 mock rows, columns: Title, Severity, Status, Reporter, Created. Match the existing Bug Reports look exactly.

Add a side-by-side view of demo 4 against `/bugs` (link out) so the user can verify aesthetic parity.

---

## 9. Step 3 — Document the contract

Create `docs/components/DATA_TABLE_CONTRACT.md`:

```markdown
# DataTable Contract

> The only allowed list-render primitive in Lowpass.

## When to use
- Any list of records (Personnel, Files, Tours, Expenses, Bugs, Deal Memos, Gear, Mics, etc)

## When NOT to use
- Spreadsheet-style data entry (use SpreadsheetGrid — UX06)
- Dashboards (use TimelineDashboard — UX07)
- Single-record detail views (use SlideOver or document layout)

## Standard column patterns
[document common patterns: name with avatar, status pill, date with relative time, amount with currency, action menu]

## API
[copy from §3]

## Anti-patterns
- Don't render a custom table inline. Always use DataTable.
- Don't put rich edit controls in cells beyond a single-click status pill or a small action menu. For row editing, open a SlideOver via onRowClick.
- Don't use multi-column sort in v1.
- Don't rely on server-side filtering — filter the rows client-side. (For very large datasets, paginate at the API and pass paged chunks to DataTable.)
```

---

## 10. Step 4 — Retire `_legacy/sidebar`

Delete `src/components/_legacy/sidebar/` (created in UX04). Verify no imports remain. Final commit of legacy retirement.

---

## 11. Verification

1. Lint + typecheck clean
2. `/admin/data-table-playground` renders all 4 demos
3. Sort / filter / search work across all demos
4. Selection works in demo 1; bulk action toolbar appears
5. Frozen column works in demo 3
6. Demo 4 visually matches `/bugs`
7. Keyboard nav: arrow + Enter + `/` works
8. Skeleton renders when `rows={undefined}`
9. Empty state renders when filter narrows to zero rows
10. Dark mode parity

---

## 12. Acceptance criteria

- [ ] All files in `src/components/data-table/` exist
- [ ] DataTable is generic over row type
- [ ] `/admin/data-table-playground` works
- [ ] Contract doc written
- [ ] `_legacy/sidebar` deleted
- [ ] Lint + typecheck clean
- [ ] No new dependencies

---

## 13. Out of scope

- ❌ Don't migrate any existing list page to DataTable — UX13
- ❌ Don't build SpreadsheetGrid — UX06
- ❌ Don't add server-side pagination/sort/filter
- ❌ Don't add column resizing or reordering (defer to v2)
- ❌ Don't add row drag-to-reorder (use a separate component if needed elsewhere)

---

## 14. Commit plan

One commit:

```
UX05: DataTable component + playground

- Add src/components/data-table/* with full API
- Playground at /admin/data-table-playground (4 demos)
- DATA_TABLE_CONTRACT.md
- Retire _legacy/sidebar
```
