/* ============================================

   LOWPASS — Routing Right Rail

   At-a-glance stats + day-type legend for the routing page.

   v1 known limitation: this fetches its own data from

   /api/tours/[id]/routing on mount. It does NOT reflect

   in-flight edits in RoutingEditor. Refresh the page to

   re-sync. Live sync is a follow-up (lift row state into a

   shared client parent, or use SWR/react-query).

   ============================================ */

'use client';

import { useEffect, useMemo, useState } from 'react';

type RoutingLiteRow = {

  id: string;

  date: string;

  day_type: string | null;

  city: string | null;

  venue_name: string | null;

};

type Stats = {

  shows: number;

  festivals: number;

  travel: number;

  off: number;

  rehearsal: number;

  total: number;

};

function computeStats(rows: RoutingLiteRow[]): Stats {

  const stats: Stats = {

    shows: 0,

    festivals: 0,

    travel: 0,

    off: 0,

    rehearsal: 0,

    total: rows.length,

  };

  for (const r of rows) {

    const type = (r.day_type ?? '').split(',')[0]?.trim().toLowerCase() ?? '';

    if (type === 'show') stats.shows += 1;

    else if (type === 'festival') stats.festivals += 1;

    else if (type === 'travel') stats.travel += 1;

    else if (type === 'off') stats.off += 1;

    else if (type === 'rehearsal') stats.rehearsal += 1;

  }

  return stats;

}

const LEGEND: { type: string; label: string; dotClass: string }[] = [

  { type: 'show',      label: 'Show',      dotClass: 'bg-lp-orange' },

  { type: 'festival',  label: 'Festival',  dotClass: 'bg-purple-500' },

  { type: 'travel',    label: 'Travel',    dotClass: 'bg-blue-500' },

  { type: 'rehearsal', label: 'Rehearsal', dotClass: 'bg-emerald-500' },

  { type: 'off',       label: 'Off',       dotClass: 'bg-neutral-500' },

];

export function RoutingRightRail({ tourId }: { tourId: string }) {

  const [rows, setRows] = useState<RoutingLiteRow[] | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    let cancelled = false;

    fetch(`/api/tours/${tourId}/routing?lite=1`)

      .then(async (res) => {

        if (!res.ok) throw new Error(`Routing fetch failed: ${res.status}`);

        return (await res.json()) as { routing: RoutingLiteRow[] } | RoutingLiteRow[];

      })

      .then((payload) => {

        if (cancelled) return;
        setError(null);

        const list = Array.isArray(payload) ? payload : payload.routing;

        setRows(list ?? []);

      })

      .catch((e: unknown) => {

        if (cancelled) return;

        setError(e instanceof Error ? e.message : 'Failed to load routing');

      });

    return () => {

      cancelled = true;

    };

  }, [tourId]);

  const stats = useMemo(() => (rows ? computeStats(rows) : null), [rows]);

  return (

    <aside

      aria-label="Routing summary"

      className="flex h-full w-full flex-col gap-6 border-l border-lp-border bg-lp-surface p-5"

    >

      <section>

        <h3 className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">

          At a glance

        </h3>

        <div className="mt-3 grid grid-cols-2 gap-3">

          <Stat label="Shows" value={stats?.shows} />

          <Stat label="Festivals" value={stats?.festivals} />

          <Stat label="Travel days" value={stats?.travel} />

          <Stat label="Off days" value={stats?.off} />

          <Stat label="Rehearsals" value={stats?.rehearsal} />

          <Stat label="Total" value={stats?.total} />

        </div>

        {error && (

          <p className="mt-3 text-xs text-red-500" role="alert">

            {error}

          </p>

        )}

      </section>

      <section>

        <h3 className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">

          Day types

        </h3>

        <ul className="mt-3 space-y-2">

          {LEGEND.map((item) => (

            <li key={item.type} className="flex items-center gap-2 text-sm text-lp-text">

              <span

                aria-hidden

                className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`}

              />

              {item.label}

            </li>

          ))}

        </ul>

      </section>

      <section>

        <h3 className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">

          Export

        </h3>

        <button

          type="button"

          disabled

          className="mt-3 w-full rounded-md border border-lp-border bg-lp-surface-hover px-3 py-2 text-left text-sm text-lp-text-tertiary opacity-60"

          title="Coming soon"

        >

          Export routing (coming soon)

        </button>

      </section>

    </aside>

  );

}

function Stat({ label, value }: { label: string; value: number | undefined }) {

  return (

    <div className="rounded-md border border-lp-border bg-lp-surface-hover px-3 py-2">

      <div className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">

        {label}

      </div>

      <div className="mt-0.5 text-lg font-semibold tabular-nums text-lp-text">

        {value ?? '—'}

      </div>

    </div>

  );

}
