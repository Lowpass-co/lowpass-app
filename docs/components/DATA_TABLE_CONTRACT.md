# DataTable Contract

> The only allowed list-render primitive in Lowpass (after mass migration; see UX13).

## When to use

- Any list of records: Personnel, Files, Tours, Expenses, Bugs, Deal Memos, Gear, Mics, and similar.

## When NOT to use

- Spreadsheet-style data entry — use `SpreadsheetGrid` (UX06).
- Dashboards and timelines — use `TimelineDashboard` (UX07).
- Single-record detail views — use `SlideOver` or a document layout, not a table.

## Standard column patterns

- **Name + avatar (optional)**: `accessor: 'name'`, optional `cell` to render a row title with avatar/initials in the left column; keep one primary text line.
- **Status / severity pill**: `cell: (_, row) => <Pill label={...} color={...} />` with shared meta maps (e.g. `STATUS_META`) and brand-tinted colours.
- **Date / time**: `accessor: 'createdAt'`, `cell` for formatted locale string or “relative + absolute” tooltip; sortable when the underlying value is ISO.
- **Amount + currency**: `align: 'right'`, `cell` to format with numeric font and fixed decimals; search often uses a `searchAccessor` that stringifies a stable value.
- **Action menu (small)**: a single overflow menu in a cell is OK; full-row editing should open a `SlideOver` from `onRowClick`.

## API

See `src/components/data-table/types.ts` and `DataTableProps<T>`. Column definitions use `ColumnDef<T>`: `id`, `header`, `accessor`, optional `cell`, `sortable`, `width` / `minWidth`, `align`, `frozen`, `className`, and optional `filter` (text, select, multiSelect, dateRange, numberRange).

- **Row identity**: `rowKey(row) => string` (unique id).
- **Density**: `comfortable` (default) or `compact` — row heights and cell padding from UX01 tokens.
- **Selection (optional)**: `selectable`, `selectedIds`, `onSelectionChange`, `selectionActions` (rendered in the toolbar when `selectedIds.length > 0`).
- **Row interaction**: `onRowClick`, `rowClassName` — e.g. open `SlideOver` on click; the table does not own the panel.
- **Search**: `searchable` (default true), `searchPlaceholder`, `searchAccessor` to override the default “stringify visible columns” search string.
- **Pagination**: `pageSize` (default 50), `pagination`: `'paged' | 'infinite' | 'none'`. For `infinite`, use `onLoadMore` and `hasMore` (client-side chunking; no built-in fetch).
- **Loading**: pass `rows={undefined}` to show the built-in skeleton.
- **Layout**: `stickyHeader` (default true), `containerHeight` (CSS height of the scroll area; use with a parent that has a bounded height).
- **A11y**: `ariaLabel` for the table region.

v1 is **client-side** sort, filter, search, and paginate on the `rows` you pass. For very large datasets, paginate at the API and pass chunks; do not expect server round-trips inside `DataTable` yet.

## Anti-patterns

- Do not render a bespoke `<table>` or grid for list pages — use `DataTable` (per UX13 migration).
- Do not put rich edit controls in cells except light affordances (status pill, small menu, link). For editing, use `onRowClick` → `SlideOver`.
- Do not rely on multi-column sort in v1.
- Do not assume server-side filtering; filter the `rows` you pass, or pre-filter server-side and pass a smaller list.
