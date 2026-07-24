/* ============================================================
   LOWPASS — <DayRail> (R5-2: the Day surface's rail wrapper)

   The Day's left zone. Owns the CHROME — search box, Today pinning, the
   Day/Routing view toggle, the scroll container — and delegates the day list
   itself to the canonical <RoutingRail>.

   WHY A WRAPPER (Adam's ruling, R5-2): <RoutingRail> must stay purely
   presentational and props-only. That property IS the D1-3 slice guarantee —
   the tokenized crew view (/m/day/[token]) renders this same rail from
   SERVER-FILTERED props, so a rail that fetched for itself could re-introduce
   data the role slice deliberately omitted. Search + Today therefore live here,
   in the caller, exactly as Advance keeps completion % / copy-from in its own
   wrapper (AdvanceUpcomingSidebar).

   This wrapper adds NO data. It filters and decorates what the server already
   handed it, so the crew slice is byte-identical in what it exposes.

   Today is surfaced through the rail's `renderMeta` accessory slot — the same
   seam Advance uses for its progress bar. No Day-specific logic entered the rail.
   ============================================================ */

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { RoutingRail, type RailEntry } from '@/components/routing/RoutingRail';
import { labelForDayType } from '@/lib/routing/dayType';

/** One day in the Day surface's rail. Server-composed; see loadDay(). */
export interface RailDay {
  routingId: string;
  date: string | null;
  dayType: string | null;
  city: string | null;
  venue: string | null;
  href: string;
}

export function DayRail({
  days,
  activeId,
  today,
  routingHref,
}: {
  days: RailDay[];
  activeId: string;
  today: string;
  routingHref?: string;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return days;
    return days.filter((d) =>
      [d.city, d.venue, d.date, labelForDayType(d.dayType)]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(s)),
    );
  }, [days, q]);

  // RailDay → the canonical RailEntry. Pure remap of fields the server already
  // sent; nothing is added. RailEntry.date is required, so a dateless row (TBC)
  // falls back to '' and simply renders without a date.
  const entries = useMemo<RailEntry[]>(
    () =>
      filtered.map((d) => ({
        id: d.routingId,
        date: d.date ?? '',
        city: d.city,
        venueName: d.venue,
        dayType: d.dayType,
      })),
    [filtered],
  );

  const hrefById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of days) m.set(d.routingId, d.href);
    return m;
  }, [days]);

  return (
    <aside
      style={{
        borderRight: '1px solid var(--lp-border)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '10px 10px 8px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search city, venue, date…"
          data-testid="day-rail-search"
          aria-label="Search tour days"
          style={{
            width: '100%',
            fontSize: 'var(--lp-text-sm)',
            padding: '6px 10px',
            borderRadius: 'var(--lp-radius-md)',
            border: '1px solid var(--lp-border-strong)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text)',
          }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <RoutingRail
          entries={entries}
          selected={activeId}
          // Navigation is href-driven (real URLs, back-button works — §R5).
          onSelect={() => {}}
          hrefForEntry={(e) => hrefById.get(e.id) ?? '#'}
          renderMeta={(e) =>
            e.date && e.date.slice(0, 10) === today ? (
              <span
                className="lp-label-caps"
                style={{ display: 'block', marginTop: 4, fontSize: 8, color: 'var(--color-lp-orange)' }}
              >
                Today
              </span>
            ) : null
          }
          ariaLabel="Tour days"
        />
        {entries.length === 0 ? (
          <p style={{ padding: 12, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
            No days match.
          </p>
        ) : null}
      </div>

      {/* Day / Routing view toggle */}
      <div style={{ display: 'flex', gap: 4, padding: 8, borderTop: '1px solid var(--lp-border)' }}>
        <span
          data-testid="day-view-day"
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            padding: '5px 0',
            borderRadius: 'var(--lp-radius-md)',
            background: 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
            color: 'var(--lp-text)',
          }}
        >
          Day
        </span>
        {routingHref ? (
          <Link
            href={routingHref}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 'var(--lp-text-xs)',
              padding: '5px 0',
              borderRadius: 'var(--lp-radius-md)',
              color: 'var(--lp-text-secondary)',
              textDecoration: 'none',
            }}
          >
            Routing
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
