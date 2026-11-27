'use client';

/* ============================================
   <PackReadsBanner> — info-pack reads the TM walked away from (Nov 2026).
   A read runs on the server (advance_pack_reads); this is where its answers
   wait. On a show: that show's read. On the board: every show's.
   Polls only while a read is still going. "Put aside" marks it reviewed.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { markPackReadReviewed, pendingPackReads, type PackReadStatus } from '../api';
import { fmtDay } from '../format';

type Pending = { id: string; routingId: string; status: PackReadStatus; createdAt: string; found: number };

export function PackReadsBanner({
  tourId,
  routingId,
  shows,
  onReview,
}: {
  tourId: string;
  /** Only this show's reads (the show page). */
  routingId?: string;
  shows: { routingId: string; date: string; venue: string | null; city: string | null }[];
  onReview: (read: { id: string; routingId: string }) => void;
}) {
  const [reads, setReads] = useState<Pending[]>([]);

  const load = useCallback(async () => {
    try {
      setReads((await pendingPackReads(tourId, routingId)).reads);
    } catch {
      /* the banner is a convenience — never an error on the page */
    }
  }, [tourId, routingId]);

  useEffect(() => {
    let live = true;
    pendingPackReads(tourId, routingId)
      .then((r) => live && setReads(r.reads))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [tourId, routingId]);

  const going = reads.some((r) => r.status === 'reading');
  useEffect(() => {
    if (!going) return;
    const t = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(t);
  }, [going, load]);

  // One line per show: its newest read.
  const latest = [...new Map(reads.map((r) => [r.routingId, r])).values()];
  if (!latest.length) return null;

  const name = (rid: string) => {
    const s = shows.find((x) => x.routingId === rid);
    return s ? `${fmtDay(s.date)} · ${s.venue ?? s.city ?? 'Show'}` : 'A show';
  };
  const putAside = async (rid: string) => {
    const ids = reads.filter((r) => r.routingId === rid).map((r) => r.id);
    setReads((rs) => rs.filter((r) => r.routingId !== rid));
    await Promise.all(ids.map((id) => markPackReadReviewed(tourId, id).catch(() => null)));
  };

  return (
    <div className="adv-banner adv-banner-info" role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
      {latest.map((r) => (
        <div key={r.id} className="adv-row-flex" style={{ gap: 10 }}>
          <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>
            {routingId ? '' : <b>{name(r.routingId)} — </b>}
            {r.status === 'reading'
              ? 'Still reading the info pack. The answers will wait here when it’s done.'
              : r.found
                ? `Info pack read — ${r.found} suggested ${r.found === 1 ? 'answer' : 'answers'} to review.`
                : 'Info pack read — nothing in it answered these questions.'}
          </span>
          <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" onClick={() => onReview({ id: r.id, routingId: r.routingId })}>
            {r.status === 'reading' ? 'Watch' : 'Review'}
          </button>
          {r.status === 'done' ? (
            <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" onClick={() => void putAside(r.routingId)}>
              Put aside
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
