import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

export const OTHER_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Description', accessor: 'label', type: { kind: 'text' } },
  { id: 'proposed_cost', header: 'Amount', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
];
