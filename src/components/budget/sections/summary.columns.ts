import type { GridColumn } from '@/components/spreadsheet-grid/types';
import type { BudgetLineItem } from '@/types';

/**
 * Summary section is rendered as a description list in TourBudgetRebuildClient,
 * not as a SpreadsheetGrid. This export exists only to satisfy the section
 * column dispatcher; it is not consumed by any grid.
 */
export const SUMMARY_COLUMNS: GridColumn<BudgetLineItem>[] = [];
