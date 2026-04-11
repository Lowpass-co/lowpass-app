'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type TourRoutingListRow = {
  id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
};

function dayTypeSegments(dayType: string): string[] {
  return dayType.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function circleColor(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  if (segs.some((s) => s === 'show')) return '#FF4500';
  if (segs.some((s) => s === 'festival')) return '#9B59B6';
  if (segs.some((s) => s === 'travel')) return '#3498DB';
  return 'var(--lp-sidebar-text-muted)';
}

function formatRowDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function TourRoutingList({
  tourId,
  routing,
  mode,
  collapsed,
}: {
  tourId: string;
  routing: TourRoutingListRow[];
  mode: 'advance' | 'budget';
  collapsed: boolean;
}) {
  const pathname = usePathname() ?? '';

  return (
    <nav className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', collapsed && 'items-center')}>
      <ul className={cn('space-y-0.5', collapsed ? 'w-full px-0' : 'w-full')}>
        {routing.map((row) => {
          const href =
            mode === 'advance'
              ? `/tours/${tourId}/advance/${row.id}`
              : `/budget?tour_id=${tourId}`;
          const isActive = mode === 'advance' && pathname === `/tours/${tourId}/advance/${row.id}`;
          const dotColor = circleColor(row.day_type);
          const dateLine = formatRowDate(row.date);
          const city = row.city?.trim() || row.venue_name?.trim() || '—';
          const title = `${city} — ${dateLine}`;

          return (
            <li key={row.id}>
              <Link
                href={href}
                title={collapsed ? title : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 transition-colors',
                  !collapsed && 'hover:bg-[var(--lp-sidebar-hover-bg)]',
                  collapsed && 'justify-center px-2 py-2 hover:bg-[var(--lp-sidebar-hover-bg)]',
                  isActive && 'bg-[var(--lp-sidebar-active-bg)]'
                )}
              >
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13px] font-semibold leading-tight"
                      style={{
                        color: 'var(--lp-sidebar-text-heading)',
                      }}
                    >
                      {city}
                    </span>
                    <span
                      className="mt-0.5 block text-[11px] leading-tight"
                      style={{
                        color: isActive ? '#FF4500' : 'var(--lp-sidebar-text-muted)',
                      }}
                    >
                      {dateLine}
                    </span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
