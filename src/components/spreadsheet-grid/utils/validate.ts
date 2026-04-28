import type { CellType } from '../types';
import { parseInput } from './parse';

export function validateValue<T>(
  value: unknown,
  type: CellType,
  rowData: T,
  column: { validator?: (v: unknown, r: T) => string | null }
): string | null {
  let v: unknown = value;
  if (typeof value === 'string') {
    const parsed = parseInput(value, type);
    if (!parsed.ok) return parsed.error;
    v = parsed.value;
  }
  if (column.validator) {
    return column.validator(v, rowData);
  }
  return null;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
