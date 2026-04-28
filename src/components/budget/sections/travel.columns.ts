import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

const READ_ONLY = (): string => 'Read-only';

export const TRAVEL_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'flight_link', header: '', accessor: (row) => (row.flight_id ? '✈' : ''), type: { kind: 'text' }, width: 40, validator: READ_ONLY },
  { id: 'label', header: 'Description', accessor: 'label', type: { kind: 'text' } },
  { id: 'proposed_cost', header: 'Amount', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
];
