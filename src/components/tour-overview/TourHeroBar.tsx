'use client';

import { formatTourDateRange, capitaliseStatus, cn } from '@/lib/utils';
import type { TourHeroData } from './overview-utils';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-gray-500/10 text-gray-400',
};

interface TourHeroBarProps {
  artistName: string;
  tourName: string;
  startDate: string;
  endDate: string;
  status: string;
  heroData: TourHeroData;
}

export function TourHeroBar({
  artistName,
  tourName,
  startDate,
  endDate,
  status,
  heroData,
}: TourHeroBarProps) {
  const { showCount, daysUntilStart, daysRemaining, inProgress } = heroData;

  return (
    <div className="lp-dashboard-glass rounded-xl border border-lp-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-lp-text-tertiary uppercase tracking-wider">Artist</span>
          <span className="font-semibold text-lp-text">{artistName}</span>
          <span className="text-lp-text-tertiary/60" aria-hidden>
            |
          </span>
          <span className="text-lp-text-tertiary uppercase tracking-wider">Tour</span>
          <span className="text-lp-text">{tourName}</span>
          <span className="text-lp-text-tertiary/60" aria-hidden>
            |
          </span>
          <span className="text-lp-text-tertiary uppercase tracking-wider">Dates</span>
          <span className="text-lp-text">{formatTourDateRange(startDate, endDate)}</span>
          <span className="text-lp-text-tertiary/60" aria-hidden>
            |
          </span>
          <span className="text-xs text-lp-text-tertiary">
            {showCount} show{showCount !== 1 ? 's' : ''}
            {daysUntilStart !== null && daysUntilStart > 0 && (
              <span className="ml-2 text-lp-orange">· starts in {daysUntilStart}d</span>
            )}
            {inProgress && daysRemaining !== null && (
              <span className="ml-2 text-lp-orange">· {daysRemaining}d left</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              statusColors[status] ?? statusColors.planning
            )}
          >
            {capitaliseStatus(status)}
          </span>
        </div>
      </div>
    </div>
  );
}
