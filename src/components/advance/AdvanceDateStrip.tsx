/* ============================================
   LOWPASS — Advance · Day-strip navigator (P3 visual remainder)

   A horizontal strip of the tour's show/festival days, mounted on the
   fill surface so you can jump between shows without the (lg-only) left
   sidebar. Each chip links to that show's advance and shows a day-type
   accent + a mono completion %. The active show is orange-ringed and
   auto-scrolled into view.

   Data: the same GET /api/tours/[tourId]/advance?all=true the upcoming
   sidebar reads (RLS-gated). Read-only navigation — no writes, so none of
   the advance autosave / review / intake paths are touched.
   ============================================ */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { type AdvanceDateItem } from '@/components/advance/CopyAdvanceModal';
import { colourForDayType } from '@/lib/routing/dayType';
import { parseRoutingDate } from '@/lib/utils';

function isShowDay(dayType: string | null | undefined): boolean {
  const t = (dayType ?? '').toLowerCase();
  return t.includes('show') || t.includes('festival');
}

function completionPercent(d: AdvanceDateItem): number {
  const sections = d.advance?.sections ?? [];
  if (sections.length === 0) return 0;
  const statuses = d.advance?.section_statuses ?? {};
  let complete = 0;
  for (const sec of sections) {
    const key = sec.template_id ?? sec.label;
    if (statuses[key]?.status === 'complete') complete += 1;
  }
  return Math.round((complete / sections.length) * 100);
}

interface AdvanceDateStripProps {
  tourId: string;
  activeRoutingId: string;
}

export function AdvanceDateStrip({ tourId, activeRoutingId }: AdvanceDateStripProps) {
  const [items, setItems] = useState<AdvanceDateItem[] | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tours/${tourId}/advance?all=true`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { dates?: AdvanceDateItem[]; items?: AdvanceDateItem[] }) => {
        if (!alive) return;
        setItems(data.dates ?? data.items ?? []);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [tourId]);

  const days = useMemo(
    () =>
      (items ?? [])
        .filter((d) => isShowDay(d.day_type))
        .sort((a, b) => parseRoutingDate(a.date).getTime() - parseRoutingDate(b.date).getTime()),
    [items],
  );

  // Centre the active chip once the list resolves.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [days]);

  // Nothing to navigate between → don't take up vertical space.
  if (items !== null && days.length <= 1) return null;

  return (
    <nav
      aria-label="Tour days"
      className="advance-read-no-print flex gap-2 overflow-x-auto rounded-md border p-2"
      style={{
        borderColor: 'var(--lp-border-subtle)',
        background: 'var(--lp-panel)',
        scrollbarWidth: 'thin',
      }}
    >
      {items === null
        ? Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="shrink-0 animate-pulse rounded-md"
              style={{ width: 132, height: 52, background: 'var(--lp-bg-deep)' }}
            />
          ))
        : days.map((d) => {
            const active = d.routing_id === activeRoutingId;
            const date = parseRoutingDate(d.date);
            const valid = !Number.isNaN(date.getTime());
            const weekday = valid
              ? date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
              : '';
            const dayNum = valid
              ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
              : d.date;
            const pct = completionPercent(d);
            const place = d.venue_name || d.city || 'Show';
            return (
              <Link
                key={d.routing_id}
                ref={active ? activeRef : undefined}
                href={`/advance/${tourId}/${d.routing_id}`}
                aria-current={active ? 'page' : undefined}
                className="btn-transition group flex shrink-0 flex-col justify-between rounded-md border no-underline"
                style={{
                  width: 132,
                  padding: '6px 8px',
                  borderColor: active ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)',
                  background: active
                    ? 'color-mix(in srgb, var(--color-lp-orange) 8%, var(--lp-bg-deep))'
                    : 'var(--lp-bg-deep)',
                }}
                title={`${dayNum} — ${place}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="shrink-0 rounded-full"
                    style={{ width: 6, height: 6, background: colourForDayType(d.day_type) }}
                  />
                  <span
                    className="lp-mono truncate"
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                    }}
                  >
                    {weekday ? `${weekday} ` : ''}
                    {dayNum}
                  </span>
                </div>
                <div
                  className="mt-1 truncate"
                  style={{
                    fontSize: '12px',
                    color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                  }}
                >
                  {place}
                </div>
                <div
                  className="mt-1"
                  style={{ fontSize: '10px', color: 'var(--lp-text-tertiary)' }}
                >
                  <span className="lp-mono">{pct}%</span> done
                </div>
              </Link>
            );
          })}
    </nav>
  );
}
