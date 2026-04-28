import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

const LINE_STATUS_OPTS = [
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

/** Values map to budget_line_items (label holds person/memo until personnel FK lands). */
export const PAYROLL_COLUMNS: GridColumn<BudgetLineItem>[] = [
  { id: 'label', header: 'Person / memo', accessor: 'label', type: { kind: 'text' } },
  { id: 'quantity', header: 'Days', accessor: 'quantity', type: { kind: 'number', decimals: 0 }, align: 'right', width: 80 },
  { id: 'proposed_cost', header: 'Total', accessor: 'proposed_cost', type: { kind: 'number', decimals: 2 }, align: 'right' },
  { id: 'currency', header: 'CCY', accessor: 'currency', type: { kind: 'text' }, width: 64 },
  { id: 'status', header: 'Status', accessor: 'status', type: { kind: 'select', options: LINE_STATUS_OPTS }, width: 128 },
];
