/* ============================================
   LOWPASS — budget sheet totals, one row per section (Oct 2026)

   The top-left block of the budget sheet, after Adam's SUMMARY tab:

     SALARIES        30,690      0
     PER DIEM         1,300      0
     HOTEL           14,135      0
     …

   One row per budget section, in the sheet's own section order, with the
   PROPOSED and ACTUAL totals of its lines in the tour currency.

   THE INVARIANT: Σ rows === computeBudgetPnl(...).baseExpenses, for both
   columns. Each line is converted exactly as computeBudgetPnl converts it
   (projected at the live tour rate; actual at the rate locked when it first
   actualised, else live), so the block can never disagree with the P&L under
   it. A test asserts this against computeBudgetPnl directly. Both convert
   through lineInTour (migration 274: + the bank margin on foreign projections)
   and both skip Other income lines and refundable deposits held out of costs.

   Pure — no I/O — so the client sheet recomputes it as you type.
   ============================================ */

import type { FxRateMap } from '@/lib/budget/fxRates';
import { isIncomeRow } from '@/lib/budget/income-rows';
import { isHeldDeposit, lineInTour } from '@/lib/budget/lineMoney';
import type { BudgetLineItem, BudgetSection } from '@/types';

export interface SheetTotalRow {
  /** section id, or '__uncat__' for lines with no (known) section. */
  id: string;
  name: string;
  projected: number;
  actual: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function sheetTotalsBySection(
  lines: BudgetLineItem[],
  sections: BudgetSection[],
  tourCurrency: string,
  fxRates: FxRateMap = {},
  /** Migration 274 — budget_settings.fx_margin_pct (fraction). */
  fxMarginPct: number = 0,
): SheetTotalRow[] {
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  const ordered = [...sections].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const known = new Set(ordered.map((s) => s.id));
  const acc = new Map<string, { projected: number; actual: number }>();
  for (const l of lines) {
    if (isIncomeRow(l) || isHeldDeposit(l)) continue;
    const { projected: p, actual: a } = lineInTour(l, ccy, fxRates, fxMarginPct, 'cost');
    const key = l.section_id && known.has(l.section_id) ? l.section_id : '__uncat__';
    const cur0 = acc.get(key) ?? { projected: 0, actual: 0 };
    acc.set(key, { projected: cur0.projected + p, actual: cur0.actual + a });
  }
  const rows: SheetTotalRow[] = [];
  for (const s of ordered) {
    const t = acc.get(s.id);
    if (!t || (t.projected === 0 && t.actual === 0)) continue;
    rows.push({ id: s.id, name: s.name, ...t });
  }
  const u = acc.get('__uncat__');
  if (u && (u.projected !== 0 || u.actual !== 0)) rows.push({ id: '__uncat__', name: 'Uncategorised', ...u });
  return rows;
}
