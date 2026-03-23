export const BUDGET_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'income', label: 'Routing & Income' },
  { id: 'day-view', label: 'Day View' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'salaries', label: 'Salary & Per Diems' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'flights', label: 'Flights' },
  { id: 'transport', label: 'Transportation' },
  { id: 'production', label: 'Production & Misc' },
  { id: 'settlement', label: 'Settlement' },
  { id: 'receipts', label: 'Expense Receipts' },
] as const;

export type TabId = (typeof BUDGET_TABS)[number]['id'];
