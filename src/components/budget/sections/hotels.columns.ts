import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

export const HOTELS_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Hotel / Stay', accessor: 'label', type: { kind: 'text' } },
  { id: 'quantity', header: 'Nights', accessor: 'quantity', type: { kind: 'number', decimals: 0 }, align: 'right', width: 80 },
  { id: 'proposed_cost', header: 'Est. total', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'actual_cost', header: 'Actual', accessor: 'actual_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
];
