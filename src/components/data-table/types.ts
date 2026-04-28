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

  density?: 'comfortable' | 'compact';

  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: ReactNode;

  onRowClick?: (row: T) => void;
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

  ariaLabel?: string;
};
