'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface GridTableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right';
}

interface GridTableProps {
  columns: GridTableColumn[];
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Spreadsheet-style grid: visible cell borders, sticky header, row hover.
 * Matches Lowpass tokens (lp-border, lp-surface, lp-table-header-text).
 */
export function GridTable({ columns, children, footer, className }: GridTableProps) {
  return (
    <div
      className={cn(
        'lp-budget overflow-x-auto overflow-y-auto rounded-md border border-lp-border bg-lp-surface shadow-[inset_0_0_0_1px_var(--lp-border)]',
        'max-h-[min(72vh,calc(100vh-13rem))]',
        // Spreadsheet: clear grid, zebra rows, tall cells (Excel-like)
        '[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-lp-surface-hover/70',
        '[&_tbody_tr:nth-child(even)]:bg-lp-bg-secondary/40 dark:[&_tbody_tr:nth-child(even)]:bg-white/[0.04]',
        '[&_tbody_td]:min-h-[2.75rem] [&_tbody_td]:border-b [&_tbody_td]:border-r [&_tbody_td]:border-lp-border [&_tbody_td]:align-middle [&_tbody_td]:px-2.5 [&_tbody_td]:py-2 [&_tbody_td:last-child]:border-r-0',
        '[&_thead_th]:border-b-2 [&_thead_th]:border-lp-border [&_thead_th]:border-r [&_thead_th]:border-lp-border [&_thead_th]:bg-lp-bg-tertiary [&_thead_th]:py-2.5 [&_thead_th:last-child]:border-r-0 dark:[&_thead_th]:bg-lp-bg-secondary',
        '[&_tfoot_td]:min-h-[2.5rem] [&_tfoot_td]:border-t-2 [&_tfoot_td]:border-lp-border [&_tfoot_td]:border-r [&_tfoot_td]:border-lp-border [&_tfoot_td]:border-b-0 [&_tfoot_td]:bg-lp-bg-tertiary/80 [&_tfoot_td]:py-2 [&_tfoot_td:last-child]:border-r-0 dark:[&_tfoot_td]:bg-lp-bg-secondary/80',
        className
      )}
    >
      <table className="w-full min-w-[760px] border-collapse text-sm tabular-nums">
        <thead>
          <tr className="sticky top-0 z-20 bg-lp-bg-tertiary/95 shadow-[inset_0_-1px_0_0_var(--lp-border)] backdrop-blur-sm dark:bg-lp-bg-secondary/95">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wider lp-table-header-text',
                  col.align === 'right' && 'text-right'
                )}
                style={col.width ? { width: col.width, minWidth: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
        {footer && (
          <tfoot>
            <tr className="bg-lp-bg-tertiary/40 font-semibold text-lp-text dark:bg-lp-bg-secondary/50">
              {footer}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
