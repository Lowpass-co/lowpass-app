export const BUDGET_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'income', label: 'Routing & Income' },
  { id: 'salaries', label: 'Salaries & Per Diem' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'flights', label: 'Flights' },
  { id: 'transport', label: 'Transportation' },
  { id: 'production', label: 'Production & Misc' },
  { id: 'receipts', label: 'Expense Receipts' },
  { id: 'commissions', label: 'Commissions' },
  { id: 'settlement', label: 'Settlement' },
] as const;

export type TabId = (typeof BUDGET_TABS)[number]['id'];
