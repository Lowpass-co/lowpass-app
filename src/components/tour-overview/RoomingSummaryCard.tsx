'use client';

import { formatDayCardDate } from '@/lib/utils';
import type { RoomingCardData } from './overview-utils';

interface RoomingSummaryCardProps {
  data: RoomingCardData | null;
}

export function RoomingSummaryCard({ data }: RoomingSummaryCardProps) {
  if (!data) {
    return (
      <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-lp-text">Rooming</h3>
        <p className="text-sm text-lp-text-tertiary">No rooming data.</p>
      </div>
    );
  }

  const { nightsCovered, totalNights, assignedCount, nextCheckIn, gapCount } = data;
  const pct = totalNights > 0 ? Math.round((nightsCovered / totalNights) * 100) : 0;

  return (
    <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-lp-text">Rooming</h3>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-lp-text">{pct}%</span>
        <span className="text-xs text-lp-text-tertiary">
          nights covered ({nightsCovered}/{totalNights})
        </span>
      </div>
      <p className="mb-2 text-xs text-lp-text-tertiary">{assignedCount} room assignments</p>
      {gapCount > 0 && (
        <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">{gapCount} night gaps</p>
      )}
      {nextCheckIn && (
        <p className="text-xs text-lp-text-tertiary">
          Next check-in:{' '}
          <span className="text-lp-text">
            {nextCheckIn.hotelName}
            {nextCheckIn.city ? `, ${nextCheckIn.city}` : ''} on {formatDayCardDate(nextCheckIn.date)}
          </span>
        </p>
      )}
    </div>
  );
}
