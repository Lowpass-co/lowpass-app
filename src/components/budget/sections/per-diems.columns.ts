import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

export const PER_DIEMS_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Label', accessor: 'label', type: { kind: 'text' } },
  { id: 'proposed_cost', header: 'Total', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
];
