/* ============================================
   LOWPASS — useAdvanceRailEntries (R5-2)

   THE single advance-side data path for the tour's day list. Both rails on the
   advance surface read it:
     - AdvanceUpcomingSidebar — the 280px vertical <RoutingRail> (lg and up)
     - AdvanceDateStrip       — the horizontal strip (below lg)

   Before R5-2 each of those ran its OWN `?all=true` fetch and its own show-day
   filter/sort, so the page issued two identical requests and had two places to
   change the entry shape. This hook owns the fetch, the show-day filter, the
   sort, and the RailEntry mapping once.

   In-flight de-duplication: a module-level cache keyed by tourId means the two
   consumers share ONE network call even though both components mount (only one
   is *visible* at a time — the other is CSS-hidden by breakpoint, which does not
   unmount it). The cache holds the promise, so a second caller mounting mid-flight
   joins the first request rather than firing another.
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { type AdvanceDateItem } from '@/components/advance/CopyAdvanceModal';
import { type RailEntry } from '@/components/routing/RoutingRail';
import { parseRoutingDate } from '@/lib/utils';

/** Show + festival days only — off / travel / rehearsal aren't "advance shows". */
export function isAdvanceShowDay(dayType: string | null | undefined): boolean {
  const t = (dayType ?? '').toLowerCase();
  return t.includes('show') || t.includes('festival');
}

type LoadResult = { dates: AdvanceDateItem[]; error: string | null };

const inFlight = new Map<string, Promise<LoadResult>>();

function loadDates(tourId: string): Promise<LoadResult> {
  const cached = inFlight.get(tourId);
  if (cached) return cached;
  const p: Promise<LoadResult> = fetch(`/api/tours/${tourId}/advance?all=true`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return res.json() as Promise<{ dates?: AdvanceDateItem[]; items?: AdvanceDateItem[] }>;
    })
    // Endpoint shape is { dates }; accept { items } too in case it's swapped later.
    .then((data) => ({ dates: data.dates ?? data.items ?? [], error: null }))
    // Surface the failure rather than swallowing it — an empty list and a broken
    // request must not look the same to the caller.
    .catch((e: Error) => ({ dates: [] as AdvanceDateItem[], error: e.message }))
    .finally(() => {
      // Drop the entry once settled so a later mount refetches (the list changes
      // as advances progress); the dedupe only spans concurrent callers.
      inFlight.delete(tourId);
    });
  inFlight.set(tourId, p);
  return p;
}

export function useAdvanceRailEntries(tourId: string) {
  const [items, setItems] = useState<AdvanceDateItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDates(tourId).then((r) => {
      if (!alive) return;
      setItems(r.dates);
      setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [tourId]);

  /** Show days, chronological. The one filter+sort both rails share. */
  const showDays = useMemo(
    () =>
      (items ?? [])
        .filter((d) => isAdvanceShowDay(d.day_type))
        .sort((a, b) => parseRoutingDate(a.date).getTime() - parseRoutingDate(b.date).getTime()),
    [items],
  );

  /** The canonical rail shape — one mapping, used by both rails. */
  const entries = useMemo<RailEntry[]>(
    () =>
      showDays.map((d) => ({
        id: d.routing_id,
        date: d.date,
        city: d.city,
        venueName: d.venue_name,
        dayType: d.day_type,
      })),
    [showDays],
  );

  const itemById = useMemo(() => {
    const m = new Map<string, AdvanceDateItem>();
    for (const d of showDays) m.set(d.routing_id, d);
    return m;
  }, [showDays]);

  return { items, showDays, entries, itemById, error, loading: items === null };
}
