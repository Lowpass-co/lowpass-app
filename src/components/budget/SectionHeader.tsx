'use client';

import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  /** Section title (e.g. "DIRECT EXPENSES", "OVERHEADS"). */
  title: string;
  /** Number of columns to span. Default 1 (single column table). */
  colSpan?: number;
  /** Optional additional class for the cell. */
  className?: string;
}

/**
 * Section header row for budget tables. Renders a full-width row with
 * uppercase, tracking-wider label. Uses lp-* tokens for light/dark.
 */
export function SectionHeader({ title, colSpan = 1, className }: SectionHeaderProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn(
          'bg-lp-bg-tertiary/30 px-4 py-2 font-medium uppercase tracking-wider text-lp-text-secondary',
          className
        )}
      >
        {title}
      </td>
    </tr>
  );
}
