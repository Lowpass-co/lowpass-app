'use client';

import { cn } from '@/lib/utils';

const densityClass = (density: 'comfortable' | 'compact' | 'cozy') =>
  density === 'compact'
    ? 'h-[var(--lp-row-compact)]'
    : density === 'cozy'
      ? 'h-[var(--lp-row-cozy)]'
      : 'h-[var(--lp-row-comfortable)]';

type DataTableSkeletonProps = {
  columns: number;
  density?: 'comfortable' | 'compact' | 'cozy';
  rows?: number;
};

export function DataTableSkeleton({ columns, density = 'comfortable', rows = 8 }: DataTableSkeletonProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: 200 }}>
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className={cn('flex w-full min-w-0 border-b', densityClass(density))}
          style={{ borderColor: 'var(--lp-border-light)' }}
        >
          {Array.from({ length: columns }).map((_, ci) => (
            <div
              key={ci}
              className="flex min-w-0 flex-1 items-center"
              style={{
                padding: `var(--lp-row-cell-padding-y-${density}) var(--lp-row-cell-padding-x)`,
              }}
            >
              <div
                className="h-3 w-full max-w-full rounded-md animate-pulse"
                style={{ backgroundColor: 'var(--lp-border-light)' }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
