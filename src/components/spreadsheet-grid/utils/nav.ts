import type { CellCoord, DisplayEntry, GridColumn } from '../types';

export function getDataRowIdOrder<T>(display: DisplayEntry<T>[]): string[] {
  return display
    .filter((e): e is DisplayEntry<T> & { kind: 'data' } => e.kind === 'data')
    .map(e => e.row.id);
}

export function nextCellId(
  dataIds: string[],
  colIds: string[],
  current: CellCoord,
  dRow: number,
  dCol: number
): CellCoord | null {
  const ri = dataIds.indexOf(current.rowId);
  const ci = colIds.indexOf(current.columnId);
  if (ri < 0 || ci < 0) return null;
  const nri = Math.max(0, Math.min(dataIds.length - 1, ri + dRow));
  const nci = Math.max(0, Math.min(colIds.length - 1, ci + dCol));
  return { rowId: dataIds[nri]!, columnId: colIds[nci]! };
}

export function isReadOnly<T>(row: { computed?: boolean }, col: GridColumn<T>): boolean {
  if (row.computed) return true;
  if (col.type.kind === 'computed') return true;
  return false;
}
