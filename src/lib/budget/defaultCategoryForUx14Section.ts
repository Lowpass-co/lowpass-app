import type { BudgetSectionKind } from '@/lib/budget/budgetUx14Kinds';

/** Default `budget_line_items.category` when inserting a manual row via UX14 hub (section is authoritative). */
export function defaultCategoryForUx14Section(kind: BudgetSectionKind): string {
  switch (kind) {
    case 'income':
      return 'prod_misc';
    case 'expenses':
      return 'prod_misc';
    case 'hotels':
      return 'hotels';
    case 'travel':
      return 'transport_misc';
    case 'hire':
      return 'prod_equipment';
    case 'payroll':
      return 'prod_misc';
    case 'per_diems':
      return 'prod_misc';
    case 'other':
      return 'prod_misc';
    case 'summary':
    default:
      return 'prod_misc';
  }
}
