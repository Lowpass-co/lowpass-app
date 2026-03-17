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

export function GridTable({ columns, children, footer, className }: GridTableProps) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-lp-border', className)}>
      <table className="w-full min-w-[800px] border-collapse">
        <thead>
          <tr className="bg-lp-surface sticky top-0 z-10">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-xs font-bold uppercase tracking-wider text-lp-text-secondary px-2 py-2 border-b border-lp-border/30 whitespace-nowrap',
                  col.align === 'right' ? 'text-right' : 'text-left'
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-lp-border/30">
          {children}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="font-bold border-t-2 border-lp-border bg-lp-surface/50">
              {footer}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
