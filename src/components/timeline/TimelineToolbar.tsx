'use client';

import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type TimelineToolbarProps = {
  monthLabel: string;
  showJumpToday: boolean;
  onJumpToday: () => void;
  extra?: ReactNode;
  className?: string;
};

export function TimelineToolbar({
  monthLabel,
  showJumpToday,
  onJumpToday,
  extra,
  className,
}: TimelineToolbarProps) {
  return (
    <div
      className={cn('sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2', className)}
      style={{
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-surface)',
        borderBottom: '1px solid var(--lp-border)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {showJumpToday && (
          <button
            type="button"
            onClick={onJumpToday}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-medium"
            style={{
              borderColor: 'var(--lp-border)',
              color: 'var(--lp-text)',
              background: 'var(--lp-bg)',
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Today
          </button>
        )}
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--lp-text)' }}
        >
          {monthLabel}
        </span>
      </div>
      {extra}
    </div>
  );
}
