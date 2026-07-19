'use client';

import type { GridColumn, GridRow } from './types';
import { GridCell } from './GridCell';
import { cn } from '@/lib/utils';

const DEF_W = 160;

type GridDataRowProps<T> = {
  row: GridRow<T>;
  /** Transient deep-link focus — draws the orange inset ring (see globals.css
   *  `.lp-grid-row-focus`). Owned by the caller's fade timer. */
  highlighted?: boolean;
  rowIndex1: number;
  columns: GridColumn<T>[];
  columnWidths: Record<string, number>;
  frozenLeft: Record<string, number>;
  density: 'comfortable' | 'compact' | 'tight' | 'cozy';
  isInRange: (rowId: string, colId: string) => boolean;
  isActive: (rowId: string, colId: string) => boolean;
  isEditing: (rowId: string, colId: string) => boolean;
  mode: 'navigate' | 'edit';
  draft: string;
  onDraft: (s: string) => void;
  onEditorKey: (e: React.KeyboardEvent) => void;
  onCellMouseDown: (rowId: string, colId: string, e: React.MouseEvent, extend: boolean) => void;
  onCellMouseEnter: (rowId: string, colId: string) => void;
  readOnly: (row: GridRow<T>, col: GridColumn<T>) => boolean;
  readOnlyHint?: (row: GridRow<T>, col: GridColumn<T>) => string | undefined;
  error: (rowId: string, colId: string) => string | null;
  showBulkHint: (rowId: string, colId: string) => boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  rowClassName?: string;
  entitySearchTourId?: string | null;
};

export function GridDataRow<T>(props: GridDataRowProps<T>) {
  const {
    row,
    highlighted,
    rowIndex1,
    columns,
    columnWidths,
    frozenLeft,
    density,
    isInRange,
    isActive,
    isEditing,
    mode,
    draft,
    onDraft,
    onEditorKey,
    onCellMouseDown,
    onCellMouseEnter,
    readOnly,
    readOnlyHint,
    error,
    showBulkHint,
    onContextMenu,
    rowClassName,
    entitySearchTourId,
  } = props;
  return (
    <tr
      className={cn('group border-b', highlighted && 'lp-grid-row-focus', rowClassName, row.className)}
      data-grid-row-id={row.id}
      style={{
        height: `var(--lp-row-${density})`,
        borderColor: 'var(--lp-border-light)',
      }}
      onContextMenu={onContextMenu}
    >
      {columns.map((col, i) => {
        const w = columnWidths[col.id] ?? col.width ?? DEF_W;
        const isFrozen = Boolean(i === 0 || col.frozen);
        return (
          <GridCell
            key={col.id}
            row={row}
            col={col}
            colIndex={i}
            density={density}
            width={w}
            frozen={isFrozen}
            left={isFrozen ? frozenLeft[col.id] : undefined}
            mode={mode}
            isActive={isActive(row.id, col.id)}
            isInRange={isInRange(row.id, col.id)}
            isEditing={isEditing(row.id, col.id)}
            draft={draft}
            onDraft={onDraft}
            onEditorKey={onEditorKey}
            onMouseDown={e => onCellMouseDown(row.id, col.id, e, e.shiftKey)}
            onMouseEnter={() => onCellMouseEnter(row.id, col.id)}
            readOnly={readOnly(row, col)}
            readOnlyHint={readOnlyHint?.(row, col)}
            error={error(row.id, col.id)}
            bulkHint={showBulkHint(row.id, col.id)}
            ariaRow={rowIndex1}
            ariaCol={i + 1}
            entitySearchTourId={entitySearchTourId}
          />
        );
      })}
    </tr>
  );
}
