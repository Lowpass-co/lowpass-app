import type { CellType } from '../types';

const NUM_CLEAN = /[^0-9.\-eE]/g;

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export function parseInput(raw: string, type: CellType): ParseResult {
  const t = raw.trim();
  if (type.kind === 'text') {
    return { ok: true, value: t };
  }
  if (type.kind === 'checkbox') {
    const lower = t.toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(lower)) return { ok: true, value: true };
    if (['0', 'false', 'no', 'n', 'off', ''].includes(lower)) return { ok: true, value: false };
    return { ok: false, error: 'Use true/false or 1/0' };
  }
  if (type.kind === 'number' || type.kind === 'currency') {
    const n = parseFloat(t.replace(NUM_CLEAN, ''));
    if (Number.isNaN(n)) return { ok: false, error: 'Enter a number' };
    if (type.kind === 'number' && type.min != null && n < type.min) return { ok: false, error: `Min ${type.min}` };
    if (type.kind === 'number' && type.max != null && n > type.max) return { ok: false, error: `Max ${type.max}` };
    return { ok: true, value: n };
  }
  if (type.kind === 'percent') {
    const cleaned = t.replace(/%/g, '').trim();
    const n = parseFloat(cleaned.replace(NUM_CLEAN, ''));
    if (Number.isNaN(n)) return { ok: false, error: 'Enter a percent' };
    return { ok: true, value: n / 100 };
  }
  if (type.kind === 'date') {
    if (!t) return { ok: true, value: null };
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'Invalid date' };
    return { ok: true, value: d.toISOString() };
  }
  if (type.kind === 'select') {
    const o = type.options.find(x => x.value === t || x.label === t);
    if (o) return { ok: true, value: o.value };
    return { ok: false, error: 'Pick a valid option' };
  }
  if (type.kind === 'computed' || type.kind === 'entityRef') {
    return { ok: true, value: t };
  }
  return { ok: true, value: t };
}
