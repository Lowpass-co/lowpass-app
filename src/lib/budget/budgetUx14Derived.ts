import type { BudgetLineItem } from '@/types';

/** Row is synced from canonical flight / hotel+room / hire gear metadata. */
export function isUx14DerivedBudgetLine(row: BudgetLineItem): boolean {
  return !!(
    row.flight_id ||
    row.hotel_id ||
    row.room_id ||
    row.gear_id ||
    row.tour_gear_id
  );
}

/** API rejects edits to computed fields — mirror in UI. Notes stay editable. */
export function isUx14DerivedLockedCell(row: BudgetLineItem, columnId: string): boolean {
  if (!isUx14DerivedBudgetLine(row)) return false;
  if (columnId === 'flight_link') return true;
  return ['label', 'quantity', 'proposed_cost', 'actual_cost', 'currency', 'routing_id', 'status'].includes(
    columnId
  );
}

export function ux14BudgetLineDerivedHint(row: BudgetLineItem): string {
  if (row.flight_id) return `Linked to flight (${row.label || row.flight_id})`;
  if (row.room_id || row.hotel_id) return 'Linked to rooming — edit hotels / room assignment at source.';
  if (row.gear_id || row.tour_gear_id) return 'Linked to gear hire — edit tour gear at source.';
  return 'Derived line';
}
