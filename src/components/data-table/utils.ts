import type { ColumnDef, ColumnFilter, FilterValue } from './types';

export function getCellValue<T>(row: T, col: ColumnDef<T>): unknown {
  if (typeof col.accessor === 'function') {
    return col.accessor(row);
  }
  return row[col.accessor as keyof T];
}

export function formatCellString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function stringifyRowForSearch<T>(
  row: T,
  columns: ColumnDef<T>[],
  searchAccessor?: (row: T) => string
): string {
  if (searchAccessor) {
    return searchAccessor(row).toLowerCase();
  }
  return columns
    .map(c => formatCellString(getCellValue(row, c)))
    .join(' ')
    .toLowerCase();
}

export function applySearch<T>(
  rows: T[],
  q: string,
  columns: ColumnDef<T>[],
  searchAccessor?: (row: T) => string
): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return rows;
  return rows.filter(r => stringifyRowForSearch(r, columns, searchAccessor).includes(t));
}

function parseDateValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return t;
}

function parseNumberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function rowPassesFilters<T>(
  row: T,
  columns: ColumnDef<T>[],
  filterState: Record<string, FilterValue | undefined>
): boolean {
  for (const [colId, fv] of Object.entries(filterState)) {
    if (!fv) continue;
    const def = columns.find(c => c.id === colId)?.filter;
    if (!def) continue;
    const col = columns.find(c => c.id === colId);
    if (!col) continue;
    const cell = getCellValue(row, col);

    if (fv.kind === 'text' && def.kind === 'text') {
      const q = fv.value.trim().toLowerCase();
      if (!q) continue;
      if (!formatCellString(cell).toLowerCase().includes(q)) {
        return false;
      }
    } else if (fv.kind === 'select' && def.kind === 'select') {
      if (!fv.value.trim()) continue;
      if (String(cell) !== fv.value) return false;
    } else if (fv.kind === 'multiSelect' && def.kind === 'multiSelect') {
      if (fv.values.length === 0) continue;
      const s = String(cell);
      if (!fv.values.includes(s)) return false;
    } else if (fv.kind === 'dateRange' && def.kind === 'dateRange') {
      if (!fv.from.trim() && !fv.to.trim()) continue;
      const t = parseDateValue(cell);
      if (t === null) return false;
      if (fv.from) {
        const from = Date.parse(fv.from);
        if (!Number.isNaN(from) && t < from) return false;
      }
      if (fv.to) {
        const to = Date.parse(fv.to);
        if (!Number.isNaN(to) && t > to + 86400000 - 1) return false;
      }
    } else if (fv.kind === 'numberRange' && def.kind === 'numberRange') {
      if (fv.min === '' && fv.max === '') continue;
      const n = parseNumberValue(cell);
      if (n === null) return false;
      if (fv.min !== '') {
        const min = Number(fv.min);
        if (Number.isFinite(min) && n < min) return false;
      }
      if (fv.max !== '') {
        const max = Number(fv.max);
        if (Number.isFinite(max) && n > max) return false;
      }
    }
  }
  return true;
}

export function defaultFilterValue(filter: ColumnFilter): FilterValue {
  switch (filter.kind) {
    case 'text':
      return { kind: 'text', value: '' };
    case 'select':
      return { kind: 'select', value: '' };
    case 'multiSelect':
      return { kind: 'multiSelect', values: [] };
    case 'dateRange':
      return { kind: 'dateRange', from: '', to: '' };
    case 'numberRange':
      return { kind: 'numberRange', min: '', max: '' };
    default: {
      const _x: never = filter;
      return _x;
    }
  }
}

export function filterValueIsActive(fv: FilterValue | undefined, def: ColumnFilter): boolean {
  if (!fv) return false;
  if (fv.kind === 'text' && def.kind === 'text') {
    return fv.value.trim().length > 0;
  }
  if (fv.kind === 'select' && def.kind === 'select') {
    return fv.value.length > 0;
  }
  if (fv.kind === 'multiSelect' && def.kind === 'multiSelect') {
    return fv.values.length > 0;
  }
  if (fv.kind === 'dateRange' && def.kind === 'dateRange') {
    return Boolean(fv.from || fv.to);
  }
  if (fv.kind === 'numberRange' && def.kind === 'numberRange') {
    return Boolean(fv.min || fv.max);
  }
  return false;
}

function compareForSort(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  const sa = formatCellString(a);
  const sb = formatCellString(b);
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortRows<T>(
  rows: T[],
  column: ColumnDef<T> | undefined,
  direction: 'asc' | 'desc'
): T[] {
  if (!column) return rows;
  const d = direction === 'asc' ? 1 : -1;
  return [...rows].sort((r1, r2) => d * compareForSort(getCellValue(r1, column), getCellValue(r2, column)));
}

export function resolveWidthStyle(w?: number | string): { width: string; minWidth?: string } | undefined {
  if (w === undefined) return undefined;
  if (typeof w === 'number') {
    return { width: `${w}px` };
  }
  return { width: w };
}

/** Display label for a filter on a chip. */
export function formatFilterLabel(
  def: ColumnFilter,
  value: FilterValue | undefined
): string {
  if (!value) return '';
  if (def.kind === 'text' && value.kind === 'text') return value.value;
  if (def.kind === 'select' && value.kind === 'select') {
    const o = def.options.find(x => x.value === value.value);
    return o?.label ?? value.value;
  }
  if (def.kind === 'multiSelect' && value.kind === 'multiSelect') {
    if (value.values.length === 0) return '';
    if (value.values.length === 1) {
      const o = def.options.find(x => x.value === value.values[0]);
      return o?.label ?? value.values[0];
    }
    return `${value.values.length} selected`;
  }
  if (def.kind === 'dateRange' && value.kind === 'dateRange') {
    const a = [value.from, value.to].filter(Boolean);
    return a.join(' – ');
  }
  if (def.kind === 'numberRange' && value.kind === 'numberRange') {
    const parts: string[] = [];
    if (value.min) parts.push(`≥ ${value.min}`);
    if (value.max) parts.push(`≤ ${value.max}`);
    return parts.join(' ');
  }
  return '';
}
