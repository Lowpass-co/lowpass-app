'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DayCard } from './DayCard';
import type { Tour } from '@/types';
import type { RoutingDate } from '@/types';
import type { DayType } from '@/types';

interface DayViewTimelineProps {
  tour: Tour;
  routingDates: RoutingDate[];
}

function getDayTypeCounts(routingDates: RoutingDate[]): { show: number; off: number; travel: number } {
  let show = 0;
  let off = 0;
  let travel = 0;
  for (const r of routingDates) {
    const t = (r.day_type as DayType) ?? 'show';
    if (t === 'show' || t === 'festival') show++;
    else if (t === 'off' || t === 'rehearsal' || t === 'press' || t === 'radio' || t === 'tv') off++;
    else if (t === 'travel') travel++;
    else off++;
  }
  return { show, off, travel };
}

export function DayViewTimeline({ tour, routingDates }: DayViewTimelineProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const sortedDates = useMemo(
    () => [...routingDates].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [routingDates]
  );

  const counts = useMemo(() => getDayTypeCounts(routingDates), [routingDates]);

  const hashToDate = useCallback((hash: string) => {
    const m = hash.match(/^#day-(.+)$/);
    return m ? m[1] : null;
  }, []);

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const dateFromHash = hashToDate(hash);
    if (dateFromHash && sortedDates.some((r) => r.date === dateFromHash)) {
      setExpandedDate(dateFromHash);
      return;
    }
    if (expandedDate !== null) return;
    const today = new Date().toISOString().slice(0, 10);
    const next = sortedDates.find((r) => (r.date ?? '') >= today) ?? sortedDates[sortedDates.length - 1];
    if (next?.date) {
      setExpandedDate(next.date);
      const newHash = `#day-${next.date}`;
      if (typeof window !== 'undefined' && window.location.hash !== newHash) {
        router.replace(`${pathname}${newHash}`, { scroll: false });
      }
    }
  }, [sortedDates, hashToDate, expandedDate, pathname, router]);

  const setExpanded = useCallback(
    (date: string | null) => {
      setExpandedDate(date);
      if (date) {
        const newHash = `#day-${date}`;
        if (typeof window !== 'undefined' && window.location.hash !== newHash) {
          router.replace(`${pathname}${newHash}`, { scroll: false });
        }
      }
    },
    [pathname, router]
  );

  const toggleDay = useCallback(
    (date: string) => {
      setExpanded(expandedDate === date ? null : date);
    },
    [expandedDate, setExpanded]
  );

  return (
    <>
      <header className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-4 border-b border-lp-border bg-lp-bg/95 px-4 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold text-lp-text">{tour.name}</h1>
        <span className="text-sm text-lp-text-secondary">
          {counts.show} show · {counts.off} off · {counts.travel} travel
        </span>
        <span className="text-sm font-semibold text-lp-text">
          {tour.currency} (day totals below)
        </span>
      </header>

      <div className="mt-4 space-y-2">
        {sortedDates.map((routingDate) => (
          <DayCard
            key={routingDate.id}
            tour={tour}
            routingDate={routingDate}
            isExpanded={expandedDate === routingDate.date}
            onToggle={() => toggleDay(routingDate.date ?? '')}
          />
        ))}
      </div>
    </>
  );
}
