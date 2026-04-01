'use client';

import { cn } from '@/lib/utils';

export interface BudgetTableColumn {
  header: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** e.g. "w-32", "min-w-[140px]" */
  width?: string;
}

export interface BudgetTableProps {
  /** Column definitions for the header row. */
  columns: BudgetTableColumn[];
  /** Table body content (tr elements). */
  children: React.ReactNode;
  /** Optional footer content (e.g. tr or Fragment with multiple tr). */
  footer?: React.ReactNode;
  /** Optional class for the wrapper div. */
  className?: string;
  /** Optional class for the table element. */
  tableClassName?: string;
  /** Minimum width for horizontal scroll (e.g. "min-w-[640px]"). */
  minWidth?: string;
}

/**
 * Styled table wrapper for budget tabs. Consistent header (border only),
 * border, surface, and overflow. Uses lp-* design tokens for light/dark.
 * Tailwind only.
 */
export function BudgetTable({
  columns,
  children,
  footer,
  className,
  tableClassName,
  minWidth,
}: BudgetTableProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-lp-border bg-lp-surface overflow-hidden',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className={cn('w-full text-sm border-collapse', minWidth, tableClassName)}>
          <thead>
            <tr className="border-b border-lp-border">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={cn(
                    'px-3 py-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.width,
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          {footer ? <tfoot>{footer}</tfoot> : null}
        </table>
      </div>
    </div>
  );
}
