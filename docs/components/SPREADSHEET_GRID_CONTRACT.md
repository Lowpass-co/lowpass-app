# SpreadsheetGrid contract

> Keyboard-first, virtualised data-entry grid for tour finance and production tables. Implementation: `src/components/spreadsheet-grid/`. Admin playground: `/admin/spreadsheet-playground` (builds in UX06).

## When to use

- **Budget** — per-line and sectioned expenses with currency, tax, and pinned totals.
- **Payroll** — mixed numeric and text, fast entry with column types.
- **Channel list** — mic/gear entity references (chips/UX08), levels, mutes.
- **Routing** — similar to channel list, dense power-user layouts.

## When NOT to use

- **Lists** where the goal is scan, sort, and open a record — use `DataTable` and `docs/components/DATA_TABLE_CONTRACT.md`.
- **Documents** or long-form text — use a document or canvas layout, not a grid.
- **Read-only** tabular data — `DataTable` (or a simple table) is clearer; do not use `SpreadsheetGrid` for display-only.

## Cell type catalogue

| Kind | Notes |
| --- | --- |
| `text` | Optional `multiline`. |
| `number` | `min` / `max` / `decimals`. |
| `currency` | `currency` = ISO 4217 code, optional `decimals`. |
| `percent` | Stored as 0–1; optional `decimals`. |
| `date` | `format`: `short` or `long`; parsing accepts common typed input. |
| `select` | `options: { value, label, color? }[]`. |
| `checkbox` | Boolean. |
| `computed` | Read-only column: `render(row) => ReactNode` — v1 is display-only, no in-cell edit. |
| `entityRef` | `entity`: `person` \| `flight` \| `room` \| `gear` \| `show` — pickers/UX08; v1 may stub as text. |

## Keyboard cheatsheet

| Action | Keys |
| --- | --- |
| Move active cell | Arrow keys |
| Next / previous cell | Tab / Shift+Tab (commits in edit mode) |
| Enter cell edit | Type (replace), F2, Enter (keep value, caret at end) |
| Commit & move | Enter (down), Tab (right); Shift+Enter / Shift+Tab opposite |
| Cancel edit | Escape |
| Extend selection | Shift+arrows, Shift+click, click-drag |
| Select all (first mode) | Cmd/Ctrl+A (full grid) |
| Open row context | Cmd/Ctrl+. (if `onRowOpen` is wired) |

## Bulk-edit rule

1. Select a **rectangle**. If the selection spans **more than one column**, typing to fill is **not** allowed — show the inline error and do not apply.
2. If the selection is **one column** and **multiple rows**, the first cell enters edit; on **Enter**, call `onBulkEdit(rowIds, columnId, value)` with the parsed/validated value for that column.
3. Single cell: `onCommitCell` per commit.

## Server commit pattern

- Parent owns row data. The grid optimistically updates draft state, then:
  - **`onCommitCell(rowId, columnId, value)`** — persist a single cell; on failure, revert and surface a toast (grid supports error flash + revert).
  - **`onBulkEdit(rowIds, columnId, value)`** — same for many rows in one column.
- **No formula engine in v1** — totals and derived numbers are computed by the app and passed as normal cells or pinned **computed** rows (`GridRow.computed`).

## Section headers and pinned rows

- **`sectionHeaders`**: `afterRowId: null` inserts at top; other values insert after that data row id. Optional `collapsible`.
- **Pinned top/bottom** — `isPinnedTop` / `isPinnedBottom` on `GridRow`. Use bottom for **totals**; mark `computed: true` when the whole row is derived/read-only.

## Performance

- Target: smooth scrolling and &lt;100ms single-cell commit UX for up to **~5,000 × ~30** with client **windowing** only. For larger data, **paginate or segment at the API** — do not load unbounded row arrays.

## v2 (explicitly out of scope for v1)

- Paste from Excel
- In-grid formula authoring
- Multi-disjoint selection, column drag-reorder
- Server-driven virtualisation

## Anti-patterns

- **Do not** embed `SpreadsheetGrid` inside a narrow `SlideOver` — it needs width and height for scroll + frozen panes.
- **Do not** pass more than **~5,000** rows per view without a product reason; paginate at the API.
- **Do not** add a formula language in v1 — keep totals in app code or pinned rows.
- **Do not** use `SpreadsheetGrid` for read-only browsing — use `DataTable` for a better list experience.

See also: `docs/cursor-prompts/CURSOR_PROMPT_UX06_SPREADSHEETGRID.md` (full acceptance criteria).
