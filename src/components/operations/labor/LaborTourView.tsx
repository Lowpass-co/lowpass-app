/* ============================================
   LOWPASS — <LaborTourView> (P6 · tour-level Crew › Labor)

   Thin read + jump surface: all labor calls across the tour's days, grouped by
   day, with a link to the advance day (the editing home — labor calls are edited
   there, not here). NOT payroll.
   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LaborCall } from '@/lib/labor-calls/types';

interface Day {
  id: string;
  date: string | null;
  city: string | null;
  venue: string | null;
}

function fmtDate(d: string | null): string {
  if (!d) return 'Day';
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function LaborTourView({ tourId, days }: { tourId: string; days: Day[] }) {
  const [calls, setCalls] = useState<LaborCall[] | null>(null);

  useEffect(() => {
    fetch(`/api/labor-calls?tour_id=${tourId}`)
      .then((r) => (r.ok ? r.json() : { calls: [] }))
      .then((j) => setCalls((j.calls ?? []) as LaborCall[]))
      .catch(() => setCalls([]));
  }, [tourId]);

  const byRouting = useMemo(() => {
    const m = new Map<string, LaborCall[]>();
    for (const c of calls ?? []) {
      if (!c.routing_id) continue;
      (m.get(c.routing_id) ?? m.set(c.routing_id, []).get(c.routing_id)!).push(c);
    }
    return m;
  }, [calls]);

  if (calls == null) return <div className="text-sm text-lp-text-tertiary">Loading labor calls…</div>;

  const daysWithCalls = days.filter((d) => byRouting.has(d.id));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-lp-text-tertiary">
        Read-only. Edit a day&apos;s calls on its advance page — the day is the editing home.
      </p>
      {daysWithCalls.length === 0 && (
        <div className="rounded-lg border border-dashed border-lp-border px-3 py-6 text-center text-sm text-lp-text-tertiary">
          No labor calls scheduled yet.
        </div>
      )}
      {daysWithCalls.map((d) => {
        const dc = byRouting.get(d.id) ?? [];
        return (
          <div key={d.id} className="rounded-lg border border-lp-border bg-lp-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-lp-text">
                {fmtDate(d.date)}
                {d.city ? <span className="ml-1 text-xs font-normal text-lp-text-tertiary">· {d.city}</span> : null}
              </div>
              <Link
                href={`/advance/${tourId}/${d.id}`}
                className="rounded border border-lp-border px-2 py-1 text-xs text-lp-text-secondary hover:bg-lp-surface-hover"
              >
                Open day →
              </Link>
            </div>
            <ul className="flex flex-col gap-1">
              {dc.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-lp-text">{c.department || '—'}</span>
                  {c.call_time && (
                    <span className="font-mono text-xs text-lp-text-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {c.call_time}
                    </span>
                  )}
                  {c.headcount != null && <span className="text-xs text-lp-text-secondary">×{c.headcount}</span>}
                  {c.company && <span className="text-xs text-lp-text-tertiary">· {c.company}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
