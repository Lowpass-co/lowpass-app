'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlideOver } from '@/components/shell/SlideOver';

type TourApiRow = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  currency: string;
  principal_count: number;
  band_count: number;
  crew_count: number;
  artist?: { name?: string | null } | null;
};

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TourSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [tour, setTour] = useState<TourApiRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void fetch(`/api/tours/${id}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load tour');
        return (await res.json()) as TourApiRow;
      })
      .then((data) => {
        if (!cancelled) setTour(data);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const personnelTotal = useMemo(
    () => (tour ? Number(tour.principal_count ?? 0) + Number(tour.band_count ?? 0) + Number(tour.crew_count ?? 0) : 0),
    [tour]
  );

  return (
    <SlideOver
      open
      onClose={onClose}
      title={tour?.name ?? 'Tour'}
      subtitle={<span className="text-sm text-lp-text-secondary">{tour?.artist?.name ?? 'Artist'}</span>}
      headerActions={
        <Link
          href={`/tours/${id}`}
          className="rounded border border-lp-border px-2 py-1 text-xs text-lp-text hover:bg-lp-bg-tertiary"
          onClick={onClose}
        >
          Open tour
        </Link>
      }
    >
      {loading ? <div className="text-sm text-lp-text-secondary">Loading…</div> : null}
      {error ? <div className="text-sm text-red-500">{error}</div> : null}
      {!loading && !error && tour ? (
        <div className="space-y-5 text-sm">
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Overview</h4>
            <p>Status: {tour.status}</p>
            <p>Currency: {tour.currency}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Dates</h4>
            <p>Start: {fmtDate(tour.start_date)}</p>
            <p>End: {fmtDate(tour.end_date)}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Personnel summary</h4>
            <p>Principal: {tour.principal_count}</p>
            <p>Band: {tour.band_count}</p>
            <p>Crew: {tour.crew_count}</p>
            <p>Total: {personnelTotal}</p>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Budget summary</h4>
            <p>Open Budget for full totals and categories.</p>
            <Link href={`/budget?tour_id=${tour.id}`} className="text-lp-orange hover:underline" onClick={onClose}>
              Open budget
            </Link>
          </section>
          <section className="space-y-1">
            <h4 className="text-xs uppercase tracking-wider text-lp-text-secondary">Quick actions</h4>
            <div className="flex flex-wrap gap-3">
              <Link href={`/tours/${tour.id}/overview`} className="text-lp-orange hover:underline" onClick={onClose}>
                Overview
              </Link>
              <Link href={`/tours/${tour.id}/advance`} className="text-lp-orange hover:underline" onClick={onClose}>
                Advance
              </Link>
              <Link href={`/tours/${tour.id}/personnel`} className="text-lp-orange hover:underline" onClick={onClose}>
                Personnel
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </SlideOver>
  );
}
