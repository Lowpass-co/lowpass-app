'use client';

import Link from 'next/link';

export type UpcomingItem = {
  date: string;
  venue_name: string | null;
  city: string;
  tour_name: string;
  tour_id: string;
  routing_id: string;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export function DashboardUpcoming({ items }: { items: UpcomingItem[] }) {
  return (
    <div className="lp-dashboard-glass-card rounded-2xl p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-lp-text-tertiary">Upcoming</h2>
      {items.length === 0 ? (
        <div className="mt-4 py-4 text-center">
          <p className="text-sm text-lp-text-tertiary">No upcoming days.</p>
          <Link
            href="/tours"
            className="mt-2 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
          >
            View tours
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const d = new Date(item.date);
            const dayNum = d.getDate();
            const month = MONTHS[d.getMonth()];
            const location = item.venue_name
              ? (item.city ? `${item.venue_name}, ${item.city}` : item.venue_name)
              : (item.city || 'TBC');
            return (
              <li key={`${item.tour_id}-${item.date}-${item.routing_id}`}>
                <Link
                  href={`/advance/${item.tour_id}/${item.routing_id}`}
                  className="flex items-baseline gap-3 rounded-lg p-2 transition-colors hover:bg-lp-surface-hover"
                >
                  <span className="text-lg font-bold tabular-nums text-lp-orange">{dayNum}</span>
                  <span className="text-xs font-medium uppercase text-lp-text-tertiary w-8 shrink-0">{month}</span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-lp-text">{item.tour_name}</span>
                    <span className="block truncate text-xs text-lp-text-tertiary">{location}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
