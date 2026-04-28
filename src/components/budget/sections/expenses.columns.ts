import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

const LINE_STATUS_OPTS = [
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

export const EXPENSE_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Description', accessor: 'label', type: { kind: 'text' } },
  { id: 'proposed_cost', header: 'Proposed', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'actual_cost', header: 'Actual', accessor: 'actual_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
  { id: 'status', header: 'Status', accessor: 'status', type: { kind: 'select', options: LINE_STATUS_OPTS }, width: 128 },
];
