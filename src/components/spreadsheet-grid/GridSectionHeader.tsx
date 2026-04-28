'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type GridSectionHeaderProps = {
  label: string;
  colSpan: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  density: 'comfortable' | 'compact' | 'tight';
};

const padY = (d: 'comfortable' | 'compact' | 'tight') => `var(--lp-row-cell-padding-y-${d})`;

export function GridSectionHeader({
  label,
  colSpan,
  collapsible,
  collapsed,
  onToggle,
  density,
}: GridSectionHeaderProps) {
  return (
    <tr className="border-b" style={{ borderColor: 'var(--lp-border-light)' }}>
      <td
        colSpan={colSpan}
        className={cn('text-left font-semibold uppercase [font-size:var(--lp-text-xs)] [letter-spacing:var(--lp-tracking-caps)]')}
        style={{
          backgroundColor: 'var(--lp-bg-tertiary)',
          color: 'var(--lp-text-secondary)',
          padding: `${padY(density)} var(--lp-row-cell-padding-x)`,
        }}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded"
              onClick={onToggle}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          {label}
        </div>
      </td>
    </tr>
  );
}
