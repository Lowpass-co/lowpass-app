'use client';

import { formatCurrency, formatDayCardDate } from '@/lib/utils';
import type { SettlementCardData } from './overview-utils';

interface SettlementSummaryCardProps {
  data: SettlementCardData | null;
  currency: string;
}

const statusChip = (s: string) => {
  const map: Record<string, string> = {
    reconciled: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    day_of_complete: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    pending: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  };
  return map[s] ?? 'bg-gray-500/15 text-gray-600';
};

export function SettlementSummaryCard({ data, currency }: SettlementSummaryCardProps) {
  if (!data) {
    return (
      <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
        <h3 className="mb-2 text-sm font-semibold text-lp-text">Settlement</h3>
        <p className="text-sm text-lp-text-tertiary">No settlement data.</p>
      </div>
    );
  }

  const { reconciledRevenue, reconciled, dayOfComplete, pending, missingCount, recentShows } = data;

  return (
    <div className="lp-dashboard-glass rounded-xl border border-lp-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-lp-text">Settlement</h3>
      <p className="mb-2 text-lg font-semibold text-lp-text">
        {formatCurrency(reconciledRevenue, currency)}
        <span className="ml-1 text-xs font-normal text-lp-text-tertiary">reconciled</span>
      </p>
      <div className="mb-3 flex flex-wrap gap-1 text-[10px]">
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
          {reconciled} reconciled
        </span>
        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-400">
          {dayOfComplete} day-of
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-400">
          {pending} pending
        </span>
        {missingCount > 0 && (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-medium text-red-700 dark:text-red-400">
            {missingCount} missing
          </span>
        )}
      </div>
      <div className="max-h-28 space-y-1 overflow-y-auto text-xs">
        {recentShows.map((s, i) => (
          <div key={`${s.date}-${s.venueName}-${i}`} className="flex justify-between gap-2 border-b border-lp-border/50 py-1 last:border-0">
            <span className="truncate text-lp-text">
              {formatDayCardDate(s.date)} — {s.venueName}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 capitalize ${statusChip(s.status)}`}>
              {s.status.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
