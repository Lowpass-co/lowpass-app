import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

export const HIRE_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Gear', accessor: 'label', type: { kind: 'text' } },
  { id: 'quantity', header: 'Qty', accessor: 'quantity', type: { kind: 'number', decimals: 0 }, align: 'right', width: 64 },
  { id: 'proposed_cost', header: 'Line total', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
];
