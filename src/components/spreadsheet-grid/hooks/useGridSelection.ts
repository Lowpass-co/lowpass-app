import { useCallback, useMemo, useState } from 'react';
import type { CellCoord, GridColumn, SelectionRange } from '../types';
import {
  getColumnIdsInRange,
  getRowIdsInRange,
  isRectSingleColumn,
  rangeFromAnchorFocus,
} from '../utils/displayRows';
import type { DisplayEntry } from '../types';

export function useGridSelection<T>(columns: GridColumn<T>[], display: DisplayEntry<T>[]) {
  const [anchor, setAnchor] = useState<CellCoord | null>(null);
  const [focus, setFocus] = useState<CellCoord | null>(null);

  const fullRange: SelectionRange | null = useMemo(() => {
    if (!anchor || !focus) return null;
    return rangeFromAnchorFocus(display, columns, anchor, focus);
  }, [anchor, focus, display, columns]);

  const isInRange = useCallback(
    (rowId: string, colId: string) => {
      if (!fullRange) return false;
      const rowIds = getRowIdsInRange(
        display as Array<{ kind: 'data'; row: { id: string } } | { kind: 'section' }>,
        fullRange.startRowId,
        fullRange.endRowId
      );
      const colIds = getColumnIdsInRange(columns, fullRange.startColumnId, fullRange.endColumnId);
      return rowIds.includes(rowId) && colIds.includes(colId);
    },
    [fullRange, display, columns]
  );

  const isActive = useCallback(
    (rowId: string, colId: string) => focus?.rowId === rowId && focus?.columnId === colId,
    [focus]
  );

  const selectOne = useCallback((c: CellCoord) => {
    setAnchor(c);
    setFocus(c);
  }, []);

  const moveFocus = useCallback((c: CellCoord) => {
    setAnchor(c);
    setFocus(c);
  }, []);

  const extendFocus = useCallback((c: CellCoord) => {
    setAnchor(a => a ?? c);
    setFocus(c);
  }, []);

  const selectAll = useCallback(() => {
    const data = display.filter((e): e is DisplayEntry<T> & { kind: 'data' } => e.kind === 'data');
    if (!data.length || !columns.length) return;
    const a: CellCoord = { rowId: data[0]!.row.id, columnId: columns[0]!.id };
    const f: CellCoord = {
      rowId: data[data.length - 1]!.row.id,
      columnId: columns[columns.length - 1]!.id,
    };
    setAnchor(a);
    setFocus(f);
  }, [display, columns]);

  const canBulkFill = useCallback(() => {
    if (!fullRange) return false;
    return isRectSingleColumn(fullRange);
  }, [fullRange]);

  return {
    anchor,
    focus,
    range: fullRange,
    selectOne,
    moveFocus,
    extendFocus,
    isInRange,
    isActive,
    selectAll,
    canBulkFill,
    setFocus,
    setAnchor,
  };
}
