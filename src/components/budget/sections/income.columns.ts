import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

const LINE_STATUS_OPTS = [
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

const READ_ONLY = (): string => 'Read-only';

export const INCOME_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Description', accessor: 'label', type: { kind: 'text' } },
  { id: 'proposed_cost', header: 'Amount', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right', width: 128 },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
  { id: 'routing_id', header: 'Show / Tour-wide', accessor: (row) => (row.routing_id ? 'Show' : 'Tour-wide'), type: { kind: 'text' }, width: 160, validator: READ_ONLY },
  { id: 'status', header: 'Status', accessor: 'status', type: { kind: 'select', options: LINE_STATUS_OPTS }, width: 128 },
];
