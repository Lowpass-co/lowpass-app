/** UX14 budget hub sections (`budget_line_items.section`). */

export const BUDGET_SECTION_ORDER = [
  'income',
  'expenses',
  'hotels',
  'travel',
  'hire',
  'payroll',
  'per_diems',
  'other',
  'summary',
] as const;

export type BudgetSectionKind = (typeof BUDGET_SECTION_ORDER)[number];

export const SECTION_LABELS: Record<BudgetSectionKind, string> = {
  income: 'Income',
  expenses: 'Expenses',
  hotels: 'Hotels',
  travel: 'Travel',
  hire: 'Gear hire',
  payroll: 'Payroll',
  per_diems: 'Per diems',
  other: 'Other',
  summary: 'Summary',
};
