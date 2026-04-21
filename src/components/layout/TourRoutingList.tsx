'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { dayTypeAccent, dayTypeLabel, formatDateHeading } from '@/lib/dayType';

export type TourRoutingListRow = {
  id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
};

function formatDateCollapsed(dateStr: string): string {
  // "19\nMAY" — two lines, used only in 72px collapsed mode
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric' });
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  return `${day}\n${month}`;
}

export function TourRoutingList({
  tourId,
  routing,
  mode,
  collapsed,
  isRoutingLoading,
}: {
  tourId: string;
  routing: TourRoutingListRow[];
  mode: 'advance' | 'budget';
  collapsed: boolean;
  isRoutingLoading?: boolean;
}) {
  const pathname = usePathname() ?? '';

  const showSkeletons = routing.length === 0 && isRoutingLoading;

  return (
    <nav className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', collapsed && 'items-center')}>
      <ul className={cn('space-y-1', collapsed ? 'w-full px-0' : 'w-full')}>
        {showSkeletons &&
          !collapsed &&
          Array.from({ length: 8 }).map((_, i) => (
            <li key={`sk-${i}`} className="flex items-stretch gap-3 overflow-hidden rounded-md pr-3">
              <span className="w-[3px] shrink-0 self-stretch rounded-l-md bg-[var(--lp-sidebar-hover-bg)]" aria-hidden />
              <div className="min-w-0 flex-1 space-y-1.5 py-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-3.5 w-32 max-w-full" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </li>
          ))}
        {showSkeletons &&
          collapsed &&
          Array.from({ length: 8 }).map((_, i) => (
            <li key={`sk-col-${i}`} className="flex justify-center overflow-hidden rounded-md">
              <span className="h-[28px] w-[3px] shrink-0 rounded-l-md bg-[var(--lp-sidebar-hover-bg)]" aria-hidden />
            </li>
          ))}
        {routing.map((row) => {
          const href =
            mode === 'advance'
              ? `/tours/${tourId}/advance/${row.id}`
              : `/budget?tour_id=${tourId}`;
          const isActive = mode === 'advance' && pathname === `/tours/${tourId}/advance/${row.id}`;
          const accent = dayTypeAccent(row.day_type);
          const label = dayTypeLabel(row.day_type);
          const primary = row.venue_name?.trim() || row.city?.trim() || '—';
          const secondary = row.venue_name?.trim() ? row.city?.trim() : undefined;
          const title = `${primary} — ${formatDateHeading(row.date)}`;

          return (
            <li key={row.id}>
              <Link
                href={href}
                title={collapsed ? title : undefined}
                className={cn(
                  'group relative flex items-stretch gap-3 overflow-hidden rounded-md transition-colors',
                  !collapsed && 'pr-3',
                  collapsed && 'justify-center px-0 py-0',
                  'hover:bg-[var(--lp-sidebar-hover-bg)]',
                  isActive && 'bg-[var(--lp-sidebar-active-bg)]'
                )}
              >
                <span
                  className="w-[3px] shrink-0 self-stretch rounded-l-md"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />

                {!collapsed ? (
                  <span className="min-w-0 flex-1 py-2">
                    <span
                      className="block text-[10px] font-semibold uppercase tracking-wider leading-tight"
                      style={{ color: 'var(--lp-sidebar-text-muted)' }}
                    >
                      {formatDateHeading(row.date)}
                    </span>
                    {label && (
                      <span className="mt-1 block text-[11px] leading-tight" style={{ color: accent }}>
                        {label}
                      </span>
                    )}
                    <span
                      className="mt-1 block truncate text-[13px] font-semibold leading-tight"
                      style={{ color: 'var(--lp-sidebar-text-heading)' }}
                    >
                      {primary}
                    </span>
                    {secondary && (
                      <span
                        className="mt-0.5 block truncate text-[11px] leading-tight"
                        style={{ color: 'var(--lp-sidebar-text-muted)' }}
                      >
                        {secondary}
                      </span>
                    )}
                  </span>
                ) : (
                  <span
                    className="flex flex-col items-center justify-center py-2 text-center leading-tight"
                    style={{ color: 'var(--lp-sidebar-text-heading)' }}
                  >
                    {formatDateCollapsed(row.date).split('\n').map((line, i) => (
                      <span
                        key={i}
                        className={
                          i === 0
                            ? 'text-[13px] font-semibold'
                            : 'text-[9px] font-medium uppercase tracking-wider text-[var(--lp-sidebar-text-muted)]'
                        }
                      >
                        {line}
                      </span>
                    ))}
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
