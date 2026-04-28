import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

import type { BudgetSectionKind } from '@/lib/budget/budgetUx14Kinds';
import { EXPENSE_COLUMNS } from '@/components/budget/sections/expenses.columns';
import { HIRE_COLUMNS } from '@/components/budget/sections/hire.columns';
import { HOTELS_COLUMNS } from '@/components/budget/sections/hotels.columns';
import { INCOME_COLUMNS } from '@/components/budget/sections/income.columns';
import { OTHER_COLUMNS } from '@/components/budget/sections/other.columns';
import { PAYROLL_COLUMNS } from '@/components/budget/sections/payroll.columns';
import { PER_DIEMS_COLUMNS } from '@/components/budget/sections/per-diems.columns';
import { SUMMARY_COLUMNS } from '@/components/budget/sections/summary.columns';
import { TRAVEL_COLUMNS } from '@/components/budget/sections/travel.columns';

export function spreadsheetColumnsFor(kind: BudgetSectionKind): GridColumn<BudgetLineItem>[] {
  switch (kind) {
    case 'income':
      return INCOME_COLUMNS;
    case 'expenses':
      return EXPENSE_COLUMNS;
    case 'hotels':
      return HOTELS_COLUMNS;
    case 'travel':
      return TRAVEL_COLUMNS;
    case 'hire':
      return HIRE_COLUMNS;
    case 'payroll':
      return PAYROLL_COLUMNS;
    case 'per_diems':
      return PER_DIEMS_COLUMNS;
    case 'other':
      return OTHER_COLUMNS;
    case 'summary':
      return SUMMARY_COLUMNS;
    default:
      return EXPENSE_COLUMNS;
  }
}
