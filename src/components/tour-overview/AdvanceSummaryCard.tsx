'use client';

import { formatDayCardDate } from '@/lib/utils';
import type { AdvanceCardData } from './overview-utils';

interface AdvanceSummaryCardProps {
  data: AdvanceCardData | null;
}

export function AdvanceSummaryCard({ data }: AdvanceSummaryCardProps) {
  if (!data) {
    return (
      <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-lp-text">Advance</h3>
        <p className="text-sm text-lp-text-tertiary">No advances started.</p>
      </div>
    );
  }

  const {
    total,
    complete,
    inProgress,
    notStarted,
    needsReview,
    criticalFlags,
    highFlags,
    nextShow,
  } = data;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  return (
    <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-lp-text">Advance</h3>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-lp-text">{pct}%</span>
        <span className="text-xs text-lp-text-tertiary">complete</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {[
          { label: 'Done', n: complete, c: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
          { label: 'Active', n: inProgress, c: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
          { label: 'Todo', n: notStarted, c: 'bg-gray-500/15 text-gray-600' },
          { label: 'Review', n: needsReview, c: 'bg-amber-500/15 text-amber-800 dark:text-amber-400' },
        ].map(
          (p) =>
            p.n > 0 && (
              <span key={p.label} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.c}`}>
                {p.label} {p.n}
              </span>
            )
        )}
      </div>
      {(criticalFlags > 0 || highFlags > 0) && (
        <div className="mb-2 flex gap-2 text-xs">
          {criticalFlags > 0 && (
            <span className="rounded bg-red-500/15 px-2 py-0.5 font-medium text-red-700 dark:text-red-400">
              {criticalFlags} critical
            </span>
          )}
          {highFlags > 0 && (
            <span className="rounded bg-orange-500/15 px-2 py-0.5 font-medium text-orange-800 dark:text-orange-400">
              {highFlags} high
            </span>
          )}
        </div>
      )}
      {nextShow && (
        <p className="text-xs text-lp-text-tertiary">
          Next: <span className="text-lp-text">{formatDayCardDate(nextShow.date)}</span> —{' '}
          {nextShow.venueName}
        </p>
      )}
    </div>
  );
}
