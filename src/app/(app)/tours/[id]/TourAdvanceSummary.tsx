'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { parseRoutingDate } from '@/lib/utils';
import { ArrowRight, Loader2 } from 'lucide-react';

type AdvanceDateItem = {
  routing_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
  advance: {
    instance_id: string;
    status: string;
    section_statuses: Record<string, { status: string }>;
    form_config_id: string;
    sections: { template_id: string }[];
  } | null;
};

const SHOW_DAY_TYPES = ['show', 'festival'];

export function TourAdvanceSummary({ tourId }: { tourId: string }) {
  const pathname = usePathname();
  const [dates, setDates] = useState<AdvanceDateItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tours/${tourId}/advance`)
      .then((r) => (r.ok ? r.json() : { dates: [] }))
      .then((j) => { if (!cancelled) setDates(j.dates ?? []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tourId, pathname]);

  const showDates = dates.filter((d) => SHOW_DAY_TYPES.includes(d.day_type));
  const withAdvance = showDates.filter((d) => d.advance != null);
  const completeCount = withAdvance.filter((d) => d.advance!.status === 'complete').length;
  const totalShows = showDates.length;
  const percent = totalShows > 0 ? Math.round((completeCount / totalShows) * 100) : 0;

  const upcomingNeedingAttention = showDates
    .filter((d) => {
      if (d.advance?.status === 'complete') return false;
      const dDate = new Date(d.date);
      const now = new Date();
      const in14 = new Date(now);
      in14.setDate(in14.getDate() + 14);
      return dDate >= now && dDate <= in14;
    })
    .slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-lp-border bg-lp-surface p-6">
        <Loader2 className="h-5 w-5 animate-spin text-lp-text-tertiary" />
        <span className="text-sm text-lp-text-tertiary">Loading advance…</span>
      </div>
    );
  }

  if (totalShows === 0) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-6">
        <h2 className="mb-4 text-lg font-semibold text-lp-text">Advance</h2>
        <p className="text-sm text-lp-text-secondary">No show dates in routing yet. Add shows to your routing first.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-lp-text">Advance</h2>
        <Link
          href={`/advance/${tourId}`}
          className="flex items-center gap-1.5 rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover"
        >
          Open advance
          <ArrowRight size={16} />
        </Link>
      </div>
      <p className="mb-2 text-sm text-lp-text-secondary">
        {completeCount} of {totalShows} shows advanced
      </p>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-lp-bg-tertiary">
        <div
          className="h-full rounded-full bg-lp-orange transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      {upcomingNeedingAttention.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">Upcoming — need attention</p>
          <ul className="space-y-1.5">
            {upcomingNeedingAttention.map((d) => (
              <li key={d.routing_id}>
                <Link
                  href={`/advance/${tourId}/${d.routing_id}`}
                  className="flex items-center justify-between rounded-lg border border-lp-border px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover"
                >
                  <span>
                    {parseRoutingDate(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                    {' — '}
                    {d.venue_name || d.city || '—'}
                  </span>
                  <span className="text-xs text-lp-text-tertiary">
                    {d.advance?.status === 'not_started' ? 'Not started' : d.advance?.status ?? 'Not started'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
