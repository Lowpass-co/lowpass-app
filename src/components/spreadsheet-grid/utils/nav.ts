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

/**
 * Next EDITABLE cell in Tab order (row-major), skipping read-only / computed
 * cells and wrapping to the next/previous row's first/last editable cell.
 * Stops (returns null) at the grid's editable edge so focus never escapes the
 * grid — the caller keeps `preventDefault`ing Tab. `isEditable(rowId, colId)`
 * encapsulates the isReadOnly check against the live row + column.
 */
export function nextEditableCell(
  dataIds: string[],
  colIds: string[],
  isEditable: (rowId: string, colId: string) => boolean,
  current: CellCoord,
  dir: 1 | -1,
): CellCoord | null {
  let ri = dataIds.indexOf(current.rowId);
  let ci = colIds.indexOf(current.columnId);
  if (ri < 0 || ci < 0) return null;
  const nRows = dataIds.length;
  const nCols = colIds.length;
  // At most one full pass over the grid — a grid with zero editable cells
  // simply returns null.
  for (let step = 0; step < nRows * nCols; step++) {
    ci += dir;
    if (ci >= nCols) { ci = 0; ri += 1; }
    else if (ci < 0) { ci = nCols - 1; ri -= 1; }
    if (ri < 0 || ri >= nRows) return null; // hit the grid edge — stay put
    const cand: CellCoord = { rowId: dataIds[ri]!, columnId: colIds[ci]! };
    if (isEditable(cand.rowId, cand.columnId)) return cand;
  }
  return null;
}
