/* ============================================
   LOWPASS — Tour Card (Kanban style)

   Compact card for tour list with artist,
   name, dates, status. Links to tour detail.
   ============================================ */

'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { Tour } from '@/types';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-gray-500/10 text-gray-400',
};

export function TourCard({ tour }: { tour: Tour }) {
  const artistName = tour.artist?.name ?? '—';
  const statusClass = statusColors[tour.status] ?? statusColors.planning;

  return (
    <Link
      href={`/tours/${tour.id}`}
      className="group flex flex-col rounded-xl border border-lp-border bg-lp-surface p-5 transition-all hover:border-lp-orange/30 hover:bg-lp-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-lp-text-tertiary">{artistName}</p>
          <h3 className="font-semibold text-lp-text">{tour.name}</h3>
          <p className="text-sm text-lp-text-secondary">
            {formatDate(tour.start_date)} – {formatDate(tour.end_date)}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
            statusClass
          )}
        >
          {tour.status}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-end">
        <span className="flex items-center gap-1 text-xs text-lp-text-tertiary group-hover:text-lp-orange">
          Open
          <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}
