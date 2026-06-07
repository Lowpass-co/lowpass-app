'use client';

import { useMemo } from 'react';
import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow } from '@/components/spreadsheet-grid/types';
import type { BudgetSectionKind } from '@/lib/budget/budgetUx14Kinds';
import { SECTION_LABELS } from '@/lib/budget/budgetUx14Kinds';
import { convertToCurrency } from '@/lib/budget/fx';
import type { BudgetLineItem } from '@/types';
import { cn } from '@/lib/utils';

/** Sum proposed budget amounts into `primaryCurrency` via static FX lookup. */
export function computeSectionTotals(rows: BudgetLineItem[], primaryCurrency: string) {
  const primary = primaryCurrency.trim().toUpperCase();
  let inPrimary = 0;
  for (const r of rows) {
    const ccy = r.currency?.trim().toUpperCase() || primary;
    const amt = Number(r.proposed_cost ?? 0);
    inPrimary += Number.isFinite(amt) ? convertToCurrency(amt, ccy, primary) : 0;
  }
  const derivedCount = rows.filter(
    (r) => !!(r.flight_id || r.hotel_id || r.room_id || r.gear_id || r.tour_gear_id)
  ).length;
  return { inPrimary, derivedCount };
}

/** True for budget rows derived from a canonical entity (flight/hotel/room/gear) — read-only. */
function isDerivedRow(r: BudgetLineItem): boolean {
  return !!(r.flight_id || r.hotel_id || r.room_id || r.gear_id || r.tour_gear_id);
}

/** Build a synthetic pinned-bottom totals row with the section's primary-currency sum. */
function buildTotalsRow(
  kind: string,
  totalInPrimary: number,
  primaryCurrency: string,
  exampleRow: BudgetLineItem | undefined,
): GridRow<BudgetLineItem> {
  const id = `${kind}-totals`;
  const data: BudgetLineItem = {
    id,
    tour_id: exampleRow?.tour_id ?? '',
    workspace_id: exampleRow?.workspace_id ?? '',
    category: '',
    label: 'Section total',
    quantity: 0,
    proposed_cost: totalInPrimary,
    actual_cost: 0,
    currency: primaryCurrency,
    receipt_id: null,
    routing_id: null,
    notes: null,
    order_index: 0,
    created_at: exampleRow?.created_at ?? '',
    updated_at: exampleRow?.updated_at ?? '',
  };
  return { id, data, isPinnedBottom: true, computed: true };
}

export type BudgetSectionProps = {
  kind: Exclude<BudgetSectionKind, 'summary'>;
  label?: string;
  columns: GridColumn<BudgetLineItem>[];
  rows: BudgetLineItem[];
  primaryCurrency: string;
  tourDefaultCurrency: string;
  footerNote?: string;
  onCommitCell: (rowId: string, columnId: string, value: unknown) => Promise<void>;
  onRowOpen?: (row: BudgetLineItem) => void;
  entitySearchTourId?: string | null;
};

/** One UX14 spreadsheet section heading + totals chip + grid (pinned bottom totals). */
export function BudgetSection({
  kind,
  label,
  columns,
  rows,
  primaryCurrency,
  tourDefaultCurrency,
  footerNote,
  onCommitCell,
  onRowOpen,
  entitySearchTourId,
}: BudgetSectionProps) {
  const primary = primaryCurrency.trim().toUpperCase() || tourDefaultCurrency.trim().toUpperCase();
  const tc = tourDefaultCurrency.trim().toUpperCase();
  const totals = computeSectionTotals(rows, primary);

  const sectionTotalDisplay = totals.inPrimary.toLocaleString('en-GB', {
    style: 'currency',
    currency: primary,
    minimumFractionDigits: 2,
  });

  const tourConv =
    primary !== tc ? convertToCurrency(totals.inPrimary, primary, tc) : totals.inPrimary;
  const fxLabel =
    primary !== tc
      ? ` (${tc} ${tourConv.toLocaleString('en-GB', {
          style: 'currency',
          currency: tc,
        })})`
      : '';

  const gridRows = useMemo<GridRow<BudgetLineItem>[]>(
    () => [
      ...rows.map((row) => ({
        id: row.id,
        data: row,
        // Derived rows linked to canonical entities are read-only in the grid.
        computed: isDerivedRow(row),
      })),
      buildTotalsRow(kind, totals.inPrimary, primary, rows[0]),
    ],
    [rows, kind, totals.inPrimary, primary],
  );

  return (
    <section id={kind} data-budget-section={kind} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-lp-text">{label ?? SECTION_LABELS[kind]}</h2>
        <span
          className={cn(
            'inline-flex rounded-full border border-lp-border px-4 py-1 text-[11px] font-semibold uppercase tracking-wide lp-table-header-text',
            'bg-lp-bg-tertiary/80 dark:bg-lp-bg-secondary/80',
          )}
          title={footerNote ?? 'Sum of proposed amounts (converted to primary)'}
        >
          Σ {sectionTotalDisplay}
          {fxLabel}
        </span>
      </div>
      <SpreadsheetGrid<BudgetLineItem>
        columns={columns}
        rows={gridRows}
        onCommitCell={onCommitCell}
        onRowOpen={onRowOpen}
        entitySearchTourId={entitySearchTourId}
        ariaLabel={`Budget ${kind} grid`}
      />
    </section>
  );
}
