/* ============================================
   LOWPASS — Income-row classifier (Phase B §B1.3)

   The grid's variance column has always shown red when
   actual > proposed and green when actual < proposed. That's
   correct for expense rows (over budget = bad, under = good)
   but inverted for income rows where over-forecast is the
   desired outcome.

   Solution path A from the §B1.3 spec — infer from the
   row's section bucket. `budget_line_items.section = 'income'`
   is the existing discriminator (BUDGET_SECTION_ORDER in
   budgetUx14Kinds.ts).

   No new schema. If/when row-kind needs to live independently
   of section (e.g. an "income" line item filed under another
   section), promote to a row_kind enum column — flagged in
   the spec as solution path B for a later sprint.
   ============================================ */

import type { BudgetLineItem } from '@/types';

/** True when the line item should treat positive variance
 *  (actual > proposed) as favourable. */
export function isIncomeRow(line: Pick<BudgetLineItem, 'section'>): boolean {
  return (line.section ?? '').toLowerCase() === 'income';
}

/** Pick the variance text colour based on actual-vs-proposed
 *  delta + row kind. Uses tokens from globals.css — no new
 *  ones introduced (status-complete / status-needs-review /
 *  lp-error / lp-text-secondary / lp-text-tertiary).
 *
 *  Centralised here so the slide-over header trio and the
 *  grid Variance column agree on the rule without copy-pasting
 *  the threshold ladder. */
export function varianceColor(
  variancePct: number | null,
  isIncome: boolean,
): string {
  if (variancePct === null) return 'var(--lp-text-tertiary)';
  /* For income rows, positive variance = favourable (good).
     For expense rows, positive variance = over budget (bad).
     The threshold magnitudes match the §A3 grid logic. */
  const goodColor = 'var(--color-lp-status-complete)';
  const warnColor = 'var(--color-lp-status-needs-review)';
  const badColor = 'var(--color-lp-error, #EF4444)';
  if (isIncome) {
    if (variancePct >= 10) return goodColor;
    if (variancePct >= 5) return goodColor;
    if (variancePct <= -10) return badColor;
    if (variancePct <= -5) return warnColor;
    return 'var(--lp-text-secondary)';
  }
  if (variancePct >= 10) return badColor;
  if (variancePct >= 5) return warnColor;
  if (variancePct <= -5) return goodColor;
  return 'var(--lp-text-secondary)';
}
