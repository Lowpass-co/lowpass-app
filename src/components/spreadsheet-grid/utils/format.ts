import type { CellType } from '../types';

export function formatCellValue(value: unknown, type: CellType): string {
  if (value === null || value === undefined) return '';
  if (type.kind === 'checkbox') return value ? 'Yes' : '';
  if (type.kind === 'computed') return '';
  if (type.kind === 'entityRef') return String(value ?? '');
  if (type.kind === 'text') return String(value);
  if (type.kind === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const d = type.decimals ?? 2;
    return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  if (type.kind === 'currency') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const dec = type.decimals ?? 2;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: type.currency,
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(n);
  }
  if (type.kind === 'percent') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const d = type.decimals ?? 1;
    return `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: d })}%`;
  }
  if (type.kind === 'date') {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return '';
    if (type.format === 'long') {
      return d.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
  }
  if (type.kind === 'select') {
    const s = String(value);
    return type.options.find(o => o.value === s)?.label ?? s;
  }
  return String(value);
}

/** String shown when entering edit mode (no thousand separators for numbers). */
export function valueToEditString(value: unknown, type: CellType): string {
  if (value === null || value === undefined) return '';
  if (type.kind === 'checkbox') return value ? 'true' : 'false';
  if (type.kind === 'date') {
    const s = String(value);
    if (s.length >= 10) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  if (type.kind === 'percent') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(n * 100);
  }
  if (type.kind === 'number' || type.kind === 'currency') {
    return String(Number(value));
  }
  if (type.kind === 'select') {
    return String(value ?? '');
  }
  if (type.kind === 'text' || type.kind === 'entityRef') {
    return String(value);
  }
  if (type.kind === 'computed') {
    return '';
  }
  return String(value);
}

export function isNegativeNumber(value: unknown, type: CellType): boolean {
  if (type.kind !== 'currency' && type.kind !== 'number' && type.kind !== 'percent') return false;
  const n = Number(value);
  return Number.isFinite(n) && n < 0;
}
