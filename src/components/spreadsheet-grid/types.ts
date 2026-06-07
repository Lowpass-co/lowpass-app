import type { ReactNode } from 'react';

export type CellType =
  | { kind: 'text'; multiline?: boolean }
  | { kind: 'number'; min?: number; max?: number; decimals?: number }
  | { kind: 'currency'; currency: string; decimals?: number }
  | { kind: 'percent'; decimals?: number }
  | { kind: 'date'; format?: 'short' | 'long' }
  | { kind: 'select'; options: Array<{ value: string; label: string; color?: string }> }
  | { kind: 'checkbox' }
  | { kind: 'computed'; render: (row: unknown) => ReactNode }
  | { kind: 'entityRef'; entity: 'person' | 'flight' | 'room' | 'gear' | 'show' };

export type GridColumn<T> = {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => unknown);
  type: CellType;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  frozen?: boolean;
  align?: 'left' | 'right' | 'center';
  sticky?: 'left' | 'right';
  validator?: (value: unknown, row: T) => string | null;
  onCommit?: (row: T, value: unknown) => Promise<T>;
};

export type GridRow<T> = {
  id: string;
  data: T;
  isPinnedTop?: boolean;
  isPinnedBottom?: boolean;
  className?: string;
  computed?: boolean;
};

export type SectionHeader = {
  afterRowId: string | null;
  label: string;
  collapsible?: boolean;
};

export type SelectionRange = {
  startRowId: string;
  endRowId: string;
  startColumnId: string;
  endColumnId: string;
};

export type SpreadsheetGridProps<T> = {
  columns: GridColumn<T>[];
  rows: GridRow<T>[];
  density?: 'comfortable' | 'compact' | 'tight' | 'cozy';

  sectionHeaders?: SectionHeader[];

  onSelectionChange?: (range: SelectionRange | null) => void;

  onCommitCell?: (rowId: string, columnId: string, value: unknown) => Promise<void>;
  onBulkEdit?: (rowIds: string[], columnId: string, value: unknown) => Promise<void>;

  onRowOpen?: (row: T) => void;
  onRowDelete?: (rowId: string) => void;
  onRowDuplicate?: (rowId: string) => void;
  contextMenuItems?: (row: GridRow<T>) => Array<{ id: string; label: string; onSelect: () => void }>;

  containerHeight?: string;
  ariaLabel?: string;
  /** Passed to entityRef cell search (tour-scoped flights, shows, rooms). */
  entitySearchTourId?: string | null;
  /** localStorage key to persist per-column widths (e.g. per-tour). When
   *  omitted, column resizing is ephemeral (resets on remount). */
  columnWidthsKey?: string | null;
};

export type CellCoord = { rowId: string; columnId: string };

export type GridMode = 'navigate' | 'edit';

export type DisplayEntry<T> =
  | { kind: 'section'; key: string; label: string; sectionId: string; collapsible?: boolean }
  | { kind: 'data'; row: GridRow<T> };
