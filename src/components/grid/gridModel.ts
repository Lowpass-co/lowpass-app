/* ============================================
   LOWPASS — Canonical Grid · pure model helpers

   Direct port of the playbox's helper functions (visCols/navCols/fmt/
   variance/formulaEst/grossExpenses/flatRows/inSel/template/disp…), made
   pure (state passed in, nothing global) so they're testable and reusable
   by every surface. No React, no DOM.
   ============================================ */

import type { Column, Row, Section, Sel } from './types';

/** Display-currency symbol for the grid + all totals (demo: USD). FX is a
    static table here; the spec wires a live feed in a later phase. */
export const CUR = '$';
export const STATUSES = ['budgeted', 'paid', 'reconciled', 'refunded'] as const;
export const INCOME_STATUSES = ['projected', 'confirmed', 'settled', 'paid'] as const;
/** Cell types that participate in keyboard navigation / editing. */
export const EDIT_TYPES = ['text', 'money', 'number', 'status', 'dropdown', 'check'] as const;

/** Stable 5-accent rotation (token-clean — see grid.css / design-tokens). */
export const ACCENTS = [
  'var(--lp-grid-accent-1)',
  'var(--lp-grid-accent-2)',
  'var(--lp-grid-accent-3)',
  'var(--lp-grid-accent-4)',
  'var(--lp-grid-accent-5)',
] as const;

export const CURS = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const;
export const SYM: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$' };
export const FX: Record<string, number> = { USD: 1, GBP: 1.27, EUR: 1.08, CAD: 0.74, AUD: 0.66 };

/** Convert an amount in currency `c` to the display currency. */
export function disp(a: unknown, c?: string): number {
  return (Number(a) || 0) * (FX[c || 'USD'] || 1);
}
export function sym(c?: string): string {
  return SYM[c || 'USD'] || '$';
}
export function fmt(n: unknown): string {
  return CUR + Number(Math.round(Number(n) || 0)).toLocaleString('en-US');
}

export function isFormula(s: Section): boolean {
  return s.kind === 'formula';
}
export function visCols(cols: Column[]): Column[] {
  return cols.filter((c) => !c.hidden);
}
export function navCols(cols: Column[]): string[] {
  return visCols(cols)
    .filter((c) => (EDIT_TYPES as readonly string[]).includes(c.type))
    .map((c) => c.id);
}
export function colDef(cols: Column[], id: string): Column | undefined {
  return cols.find((c) => c.id === id);
}

/** Σ display-currency estimates across every non-formula line. */
export function grossExpenses(data: Section[]): number {
  let t = 0;
  data.forEach((s) => {
    if (!isFormula(s)) s.rows.forEach((r) => (t += disp(r.est, r.cur)));
  });
  return t;
}
/** A formula-section line's estimate: a % of gross (or net = gross×0.85),
    unless the line was switched to a fixed custom value. */
export function formulaEst(row: Row, data: Section[]): number {
  if (row.custom) return Number(row.est) || 0;
  const base = row.basis === 'net' ? grossExpenses(data) * 0.85 : grossExpenses(data);
  return base * ((Number(row.pct) || 0) / 100);
}

export function variance(row: Row, estVal?: number): { d: number; pct: number } | null {
  const est = estVal !== undefined ? estVal : Number(row.est) || 0;
  const act = Number(row.act) || 0;
  if (!act || !est) return null;
  const d = act - est;
  return { d, pct: est ? (d / est) * 100 : 0 };
}

/** grid-template-columns string from the visible columns' live widths.
 *  GRID-24 — the name/`item` column is a flex track (`minmax(w, 1fr)`) so the
 *  grid fills its container and the leftover width lands on the name column;
 *  every other column stays a fixed px track (numbers stay right-aligned). */
export function template(cols: Column[], widths: Record<string, number>): string {
  return visCols(cols)
    .map((c) => {
      const w = widths[c.id] ?? c.w;
      return c.id === 'item' ? `minmax(${w}px, 1fr)` : `${w}px`;
    })
    .join(' ');
}

export function inSel(sel: Sel, r: number, c: number): boolean {
  const r0 = Math.min(sel.ar, sel.fr),
    r1 = Math.max(sel.ar, sel.fr),
    c0 = Math.min(sel.ac, sel.fc),
    c1 = Math.max(sel.ac, sel.fc);
  return r >= r0 && r <= r1 && c >= c0 && c <= c1;
}

export function rowMatches(row: Row, query: string, statusFilter: Set<string>): boolean {
  if (query) {
    const q = query.toLowerCase();
    if (
      !(
        (row.item || '').toLowerCase().includes(q) ||
        (row.vendor || '').toLowerCase().includes(q)
      )
    )
      return false;
  }
  return statusFilter.has(String(row.status));
}

/** Flat list of navigable rows (formula sections excluded), in render order. */
export function flatRows(
  data: Section[],
  query: string,
  statusFilter: Set<string>,
): { row: Row; si: number; ri: number }[] {
  const o: { row: Row; si: number; ri: number }[] = [];
  data.forEach((s, si) => {
    if (isFormula(s)) return;
    s.rows.forEach((row, ri) => {
      if (rowMatches(row, query, statusFilter)) o.push({ row, si, ri });
    });
  });
  return o;
}

/* ---- undo/redo snapshot helpers ----------------------------------- */

export function cloneData(data: Section[]): Section[] {
  return JSON.parse(JSON.stringify(data));
}
/** Snapshot-safe column clone: JSON drops `calc` functions (re-hydrated by
    id on restore via withCalc); `formula` specs are plain data and survive. */
export function stripCols(cols: Column[]): Column[] {
  return cols.map((c) => {
    const { calc: _calc, ...rest } = c;
    void _calc;
    return { ...rest };
  });
}
/** Re-attach `calc` functions (by column id) after restoring a snapshot. */
export function withCalc(cols: Column[], fnById: Record<string, (row: Row) => number>): Column[] {
  return cols.map((c) => (fnById[c.id] ? { ...c, calc: fnById[c.id] } : c));
}
