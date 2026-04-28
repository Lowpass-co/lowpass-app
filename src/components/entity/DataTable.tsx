'use client';

/**
 * Compatibility shim: forwards calls from UX13 client components (which used
 * an early stub API) to the canonical <DataTable> from `@/components/data-table`.
 *
 * New code should import directly from `@/components/data-table/DataTable`. This
 * adapter exists only to keep UX13's pre-existing list clients (Personnel,
 * Rider Packs, Files, Gear, Deal Memos, Templates, Advance Flights) working
 * while the foundation lands. Migration to the rich API (sort/filter/search/
 * pagination/keyboard-nav) is a Phase 3 task per the recovery plan.
 */

import type { ReactNode } from 'react';
import { DataTable as RealDataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';

type LegacyColumn<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

type LegacyDataTableProps<T> = {
  columns: LegacyColumn<T>[];
  rows: T[];
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
  /** Optional explicit row key. Defaults to row.id (or JSON.stringify fallback). */
  rowKey?: (row: T) => string;
  /** Forwards to the canonical DataTable; defaults to 'comfortable'. */
  density?: 'comfortable' | 'compact';
};

export function DataTable<T>({
  columns,
  rows,
  emptyLabel,
  onRowClick,
  rowKey,
  density = 'comfortable',
}: LegacyDataTableProps<T>) {
  // Map legacy Column<T> → ColumnDef<T>
  const mappedColumns: ColumnDef<T>[] = columns.map((col) => ({
    id: col.key,
    header: col.header,
    // Use full row as accessor since legacy render signature was render(row)
    accessor: (row: T) => row as unknown,
    cell: (_value, row) => col.render(row),
    className: col.className,
  }));

  // rowKey strategy: caller-provided, else row.id, else JSON.stringify fallback.
  const resolvedRowKey = rowKey ?? ((row: T) => {
    const r = row as { id?: string | number };
    return r.id != null ? String(r.id) : JSON.stringify(row);
  });

  return (
    <RealDataTable<T>
      rows={rows}
      columns={mappedColumns}
      rowKey={resolvedRowKey}
      density={density}
      onRowClick={onRowClick}
      // Keep features minimal so visual UX matches the legacy stub.
      // Per-page migration to the rich API is a Phase 3 follow-up.
      searchable={false}
      pagination="none"
      emptyState={
        <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
          {emptyLabel ?? 'No rows'}
        </div>
      }
    />
  );
}
