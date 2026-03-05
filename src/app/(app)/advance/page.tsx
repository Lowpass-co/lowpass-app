/* ============================================
   LOWPASS — Advance Overview Page

   Cross-tour advance: needs attention, upcoming, all tours progress.
   ============================================ */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { parseRoutingDate } from '@/lib/utils';
import { ArrowRight, AlertTriangle, Calendar, ClipboardList, Loader2 } from 'lucide-react';

type TourStat = {
  tour_id: string;
  tour_name: string;
  artist_name: string;
  advance_count: number;
  total_shows: number;
  percent: number;
};

type NeedsAttentionItem = {
  tour_id: string;
  tour_name: string;
  artist_name: string;
  routing_id: string;
  date: string;
  venue_name: string | null;
  city: string;
  reason: string;
};

type UpcomingItem = {
  tour_id: string;
  tour_name: string;
  artist_name: string;
  routing_id: string;
  date: string;
  venue_name: string | null;
  city: string;
  status: string;
};

type Overview = {
  tours: TourStat[];
  needsAttention: NeedsAttentionItem[];
  upcoming: UpcomingItem[];
};

export default function AdvanceOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/advance/overview')
      .then((r) => (r.ok ? r.json() : { tours: [], needsAttention: [], upcoming: [] }))
      .then(setData)
      .catch(() => setData({ tours: [], needsAttention: [], upcoming: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-lp-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading advance overview…
        </div>
      </div>
    );
  }

  const { tours = [], needsAttention = [], upcoming = [] } = data ?? {};

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Advance</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Cross-tour advance progress and shows needing attention.
        </p>
      </div>

      {needsAttention.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <h2 className="flex items-center gap-2 px-4 pt-4 text-lg font-semibold text-lp-text">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Needs attention
          </h2>
          <p className="px-4 pb-3 text-sm text-lp-text-secondary">
            Shows with unresolved flags or blockers
          </p>
          <ul className="divide-y divide-lp-border px-4 pb-4">
            {needsAttention.map((item) => (
              <li key={item.routing_id}>
                <Link
                  href={`/tours/${item.tour_id}/advance/${item.routing_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                >
                  <div>
                    <span className="font-medium text-lp-text">{item.tour_name}</span>
                    <span className="text-lp-text-tertiary"> · {item.artist_name}</span>
                    <span className="ml-2 text-lp-text-secondary">
                      {parseRoutingDate(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                      {' — '}
                      {item.venue_name || item.city || '—'}
                    </span>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {item.reason}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="rounded-xl border border-lp-border bg-lp-surface p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-lp-text">
            <Calendar className="h-5 w-5 text-lp-text-tertiary" />
            Upcoming — need advancing (next 14 days)
          </h2>
          <ul className="mt-3 space-y-1.5">
            {upcoming.slice(0, 20).map((item) => (
              <li key={item.routing_id}>
                <Link
                  href={`/tours/${item.tour_id}/advance/${item.routing_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
                >
                  <span>
                    {parseRoutingDate(item.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                    {' · '}
                    {item.tour_name}
                    {' — '}
                    {item.venue_name || item.city || '—'}
                  </span>
                  <span className="text-xs text-lp-text-tertiary">{item.status.replace('_', ' ')}</span>
                </Link>
              </li>
            ))}
          </ul>
          {upcoming.length > 20 && (
            <p className="mt-2 text-xs text-lp-text-tertiary">Showing first 20 of {upcoming.length}</p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-lp-border bg-lp-surface p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-lp-text">
          <ClipboardList className="h-5 w-5 text-lp-text-tertiary" />
          All tours
        </h2>
        {tours.length === 0 ? (
          <p className="mt-3 text-sm text-lp-text-secondary">No tours yet. Create a tour to see advance progress here.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tours.map((t) => (
              <li key={t.tour_id}>
                <Link
                  href={`/tours/${t.tour_id}/advance`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-lp-border px-4 py-3 text-sm hover:bg-lp-surface-hover"
                >
                  <div>
                    <span className="font-medium text-lp-text">{t.tour_name}</span>
                    <span className="text-lp-text-tertiary"> · {t.artist_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lp-text-secondary">
                      {t.advance_count} of {t.total_shows} shows advanced
                    </span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-lp-border bg-lp-bg-secondary text-xs font-medium text-lp-text">
                      {t.total_shows > 0 ? `${t.percent}%` : '—'}
                    </div>
                    <ArrowRight className="h-4 w-4 text-lp-text-tertiary" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
