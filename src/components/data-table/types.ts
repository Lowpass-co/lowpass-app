import type { ReactNode } from 'react';

export type ColumnDef<T> = {
  id: string;
  header: string | ReactNode;
  accessor: keyof T | ((row: T) => unknown);
  cell?: (value: unknown, row: T) => ReactNode;
  sortable?: boolean;
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  frozen?: boolean;
  /** The flexible primary column — when column resize is enabled it gets
   *  width:auto (absorbs the leftover, min ~200px) unless dragged. */
  flex?: boolean;
  className?: string;
  filter?: ColumnFilter;
};

export type ColumnFilter =
  | { kind: 'text' }
  | { kind: 'select'; options: Array<{ value: string; label: string }> }
  | { kind: 'multiSelect'; options: Array<{ value: string; label: string }> }
  | { kind: 'dateRange' }
  | { kind: 'numberRange' };

export type FilterValue =
  | { kind: 'text'; value: string }
  | { kind: 'select'; value: string }
  | { kind: 'multiSelect'; values: string[] }
  | { kind: 'dateRange'; from: string; to: string }
  | { kind: 'numberRange'; min: string; max: string };

export type DataTableProps<T> = {
  rows: T[] | undefined;
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;

  density?: 'comfortable' | 'compact' | 'cozy';

  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: ReactNode;

  onRowClick?: (row: T) => void;
  /** Right-click menu for a row (opt-in). Empty list = the browser's menu. */
  rowMenu?: (row: T) => import('./DataTableRowMenu').RowMenuItem[];
  rowClassName?: (row: T) => string;

  searchable?: boolean;
  searchPlaceholder?: string;
  searchAccessor?: (row: T) => string;

  pageSize?: number;
  pagination?: 'paged' | 'infinite' | 'none';
  onLoadMore?: () => void;
  hasMore?: boolean;

  emptyState?: ReactNode;

  stickyHeader?: boolean;
  containerHeight?: string;

  /** Revamp #21 — drop the raised-panel chrome (outer border / radius / shadow /
   *  surface fill) so the table sits flat ON the page, matching the Phase-1 grid
   *  family. Opt-in per caller; default keeps the boxed panel (no change). */
  flat?: boolean;

  /** Enable per-column drag-to-resize, persisted under this localStorage
   *  key (e.g. per-tour). Omit to keep columns fixed (no handles) — so
   *  existing tables are unchanged unless they opt in. */
  columnWidthsKey?: string | null;

  /** Draw the search / count / filter bar. Default true. False for a table
   *  that is one group of several under a shared toolbar (rental jobs by
   *  month) — the bar would repeat per group. It still shows while rows are
   *  selected IF selectionActions are given, so those always show. */
  toolbar?: boolean;

  ariaLabel?: string;
};
