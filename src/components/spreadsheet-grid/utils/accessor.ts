import type { GridColumn, GridRow } from '../types';

export function getCellRaw<T>(row: GridRow<T>, col: GridColumn<T>): unknown {
  if (typeof col.accessor === 'function') {
    return col.accessor(row.data);
  }
  return row.data[col.accessor as keyof T];
}
