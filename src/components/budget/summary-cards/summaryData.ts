/* ============================================
   LOWPASS — Budget Summary card data (presentation-only)

   Pure derivations for the three bricks that need line-/income-level aggregation
   (the rest read computeBudgetPnl fields directly). These SUM the same source rows
   computeBudgetPnl consumes — no P&L formula is re-implemented, no number mutated.
   Node-testable so the presentation-only invariant is provable.
   ============================================ */

import { convertToCurrency } from '@/lib/budget/fx';
import { toTourCurrency, type FxRateMap } from '@/lib/budget/fxRates';
import { getEffectiveActual } from '@/lib/budget/transactions';
import { isIncomeRow } from '@/lib/budget/income-rows';
import type { IncomeInput } from '@/lib/budget/computeBudgetPnl';
import type { BudgetLineItem, BudgetSection } from '@/types';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const COMMITTED_STATUSES = new Set(['quoted', 'approved', 'paid']);
const SPENT_STATUSES = new Set(['paid']);

export interface SectionExpense {
  id: string;
  name: string;
  actual: number;
}

/** Per-section ACTUAL expense sums (tour currency), income rows excluded, sorted
 *  desc. Same grouping as the existing Summary section rollup — the sum ties to
 *  pnl.baseExpenses.actual. */
export function expensesBySection(
  lines: BudgetLineItem[],
  sections: BudgetSection[],
  tourCurrency: string,
): SectionExpense[] {
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  const nameById = new Map(sections.map((s) => [s.id, s.name]));
  const byId = new Map<string, number>();
  for (const l of lines) {
    if (isIncomeRow(l)) continue;
    const cur = (l.currency || ccy).toUpperCase();
    const actual = convertToCurrency(getEffectiveActual(l), cur, ccy);
    const key = l.section_id && nameById.has(l.section_id) ? l.section_id : '__uncat__';
    byId.set(key, (byId.get(key) ?? 0) + actual);
  }
  return [...byId.entries()]
    .map(([id, actual]) => ({ id, name: id === '__uncat__' ? 'Uncategorised' : nameById.get(id) ?? id, actual }))
    .filter((r) => r.actual !== 0)
    .sort((a, b) => b.actual - a.actual);
}

export interface BurnFigures {
  total: number;
  committed: number;
  spent: number;
  remaining: number;
  pctUsed: number;
}

/** Committed / spent / remaining from line statuses (tour currency) — the SAME
 *  figures the budget burn-bar header shows. Presentation only. */
export function burnFrom(lines: BudgetLineItem[], tourCurrency: string): BurnFigures {
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  let total = 0;
  let committed = 0;
  let spent = 0;
  for (const l of lines) {
    if (isIncomeRow(l)) continue;
    const cur = (l.currency || ccy).toUpperCase();
    const proposed = convertToCurrency(num(l.proposed_cost), cur, ccy);
    const actual = convertToCurrency(getEffectiveActual(l), cur, ccy);
    const status = (l.status ?? '').toLowerCase();
    total += proposed;
    if (COMMITTED_STATUSES.has(status)) committed += proposed;
    if (SPENT_STATUSES.has(status)) spent += actual;
  }
  const remaining = total - spent;
  const pctUsed = total > 0 ? (spent / total) * 100 : 0;
  return { total, committed, spent, remaining, pctUsed };
}

export interface ShowIncome {
  label: string;
  income: number;
}

/** Per-show income (tour currency) — each income row's post-tax gross, using the
 *  SAME post-tax components computeBudgetPnl sums into grossIncome (no new math).
 *  Labels are index-based: budget_income (IncomeInput) carries no show name/date,
 *  so richer labels + a true per-show NET (needs show-level expense allocation) are
 *  a flagged follow-up. */
export function perShowIncome(income: IncomeInput[], tourCurrency: string, fxRates: FxRateMap): ShowIncome[] {
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  const postTaxGuar = (i: IncomeInput) =>
    i.post_tax_guarantee != null ? num(i.post_tax_guarantee) : num(i.pre_tax_guarantee) * (1 - num(i.withholding_pct) / 100);
  const postTaxOver = (i: IncomeInput) =>
    i.post_tax_overage != null ? num(i.post_tax_overage) : num(i.pre_tax_overage) * (1 - num(i.withholding_pct) / 100);
  return income
    .map((i, idx) => {
      const f = toTourCurrency(1, i.currency, ccy, fxRates);
      const gross = (postTaxGuar(i) + postTaxOver(i) + num(i.merch_income) + num(i.vip_income)) * f;
      return { label: `Show ${idx + 1}`, income: gross };
    })
    .filter((s) => s.income !== 0)
    .sort((a, b) => b.income - a.income);
}
