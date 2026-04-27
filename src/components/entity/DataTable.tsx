'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  emptyLabel,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-lp-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className={cn(
                'border-b border-lp-border/40 last:border-b-0',
                onRowClick ? 'cursor-pointer hover:bg-lp-surface-hover' : ''
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-3 py-2 text-lp-text', col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={Math.max(columns.length, 1)}
                className="px-3 py-6 text-center text-sm text-lp-text-tertiary"
              >
                {emptyLabel ?? 'No rows'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
