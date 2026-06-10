'use client';

/* ============================================
   LOWPASS — <RoomingNightsOverview> (Stage B view 2)

   One row per hotel STAY (a hotels record): hotel · city · in→out · nights ·
   room-type counts (S/D/T) · pax · cost. Aggregates that hotel's rooms,
   grouping assignments by room_id so a shared room is counted + costed ONCE —
   the same collapse reconcileDerivedLines uses, so this scans the same numbers
   the derived Accommodation budget lines show. Read-only.
   ============================================ */

import { useMemo } from 'react';

interface HotelAssignment {
  id: string;
  room_id?: string | null;
  person_name: string | null;
  check_in: string | null;
  check_out: string | null;
  room_type: string | null;
  rate_per_night: number;
}
export interface RoomingHotel {
  id: string;
  hotel_name: string;
  city?: string | null;
  room_assignments?: HotelAssignment[];
}

function nightsBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const ms = new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 86_400_000) : 0;
}
function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface StayRow {
  id: string;
  hotel: string;
  city: string;
  inDate: string | null;
  outDate: string | null;
  nights: number;
  s: number;
  d: number;
  t: number;
  pax: number;
  cost: number;
}

function summariseHotel(h: RoomingHotel): StayRow {
  const assignments = h.room_assignments ?? [];
  // group by room_id (fallback: room_type) → one room
  const rooms = new Map<string, { type: string; rate: number; start: string | null; end: string | null }>();
  const pax = new Set<string>();
  let inDate: string | null = null;
  let outDate: string | null = null;
  for (const a of assignments) {
    if (a.person_name) pax.add(a.person_name);
    if (a.check_in && (!inDate || a.check_in < inDate)) inDate = a.check_in;
    if (a.check_out && (!outDate || a.check_out > outDate)) outDate = a.check_out;
    const type = (a.room_type ?? '').trim();
    if (!type || type === '-') continue;
    const key = a.room_id ?? `${type}`;
    const prev = rooms.get(key);
    if (!prev) {
      rooms.set(key, { type, rate: Number(a.rate_per_night) || 0, start: a.check_in, end: a.check_out });
    } else {
      if (a.check_in && (!prev.start || a.check_in < prev.start)) prev.start = a.check_in;
      if (a.check_out && (!prev.end || a.check_out > prev.end)) prev.end = a.check_out;
    }
  }
  let s = 0;
  let d = 0;
  let t = 0;
  let cost = 0;
  for (const room of rooms.values()) {
    const up = room.type.toUpperCase();
    if (up.startsWith('SGL') || up.startsWith('SINGLE')) s += 1;
    else if (up.startsWith('DBL') || up.startsWith('DOUBLE') || up.startsWith('TWIN')) d += 1;
    else if (up.startsWith('TPL') || up.startsWith('TRP') || up.startsWith('TRIPLE')) t += 1;
    else d += 1; // default unknown paid rooms to "double" bucket
    cost += room.rate * nightsBetween(room.start, room.end);
  }
  return {
    id: h.id,
    hotel: h.hotel_name,
    city: h.city ?? '',
    inDate,
    outDate,
    nights: nightsBetween(inDate, outDate),
    s,
    d,
    t,
    pax: pax.size,
    cost,
  };
}

export function RoomingNightsOverview({
  hotels,
  currency,
  selectedId,
  onSelectHotel,
}: {
  hotels: RoomingHotel[];
  currency: string;
  selectedId?: string | null;
  onSelectHotel?: (id: string) => void;
}) {
  const rows = useMemo(() => hotels.map(summariseHotel), [hotels]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ s: a.s + r.s, d: a.d + r.d, t: a.t + r.t, pax: a.pax + r.pax, cost: a.cost + r.cost }),
        { s: 0, d: 0, t: 0, pax: 0, cost: 0 },
      ),
    [rows],
  );
  const money = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);

  const th: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--lp-text-secondary)',
    borderBottom: '1px solid var(--lp-border)',
    background: 'var(--lp-surface)',
    textAlign: 'left',
  };
  const td: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 13,
    color: 'var(--lp-text)',
    borderBottom: '1px solid var(--lp-border-subtle)',
  };
  const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  if (rows.length === 0) {
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>No hotels on this tour yet.</div>;
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={th}>Hotel</th>
            <th style={th}>City</th>
            <th style={th}>In → Out</th>
            <th style={{ ...th, textAlign: 'right' }}>Nights</th>
            <th style={{ ...th, textAlign: 'right' }}>S</th>
            <th style={{ ...th, textAlign: 'right' }}>D</th>
            <th style={{ ...th, textAlign: 'right' }}>T</th>
            <th style={{ ...th, textAlign: 'right' }}>Pax</th>
            <th style={{ ...th, textAlign: 'right' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={onSelectHotel ? () => onSelectHotel(r.id) : undefined}
              style={{
                cursor: onSelectHotel ? 'pointer' : 'default',
                background: selectedId === r.id ? 'var(--lp-surface)' : undefined,
              }}
            >
              <td style={{ ...td, fontWeight: 600, color: selectedId === r.id ? 'var(--lp-orange)' : 'var(--lp-text)' }}>{r.hotel}</td>
              <td style={{ ...td, color: 'var(--lp-text-secondary)' }}>{r.city || '—'}</td>
              <td style={{ ...td, color: 'var(--lp-text-secondary)' }}>
                {fmtDate(r.inDate)} → {fmtDate(r.outDate)}
              </td>
              <td style={num}>{r.nights || '—'}</td>
              <td style={num}>{r.s || '—'}</td>
              <td style={num}>{r.d || '—'}</td>
              <td style={num}>{r.t || '—'}</td>
              <td style={num}>{r.pax || '—'}</td>
              <td style={{ ...num, fontWeight: 600 }}>{money(r.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...td, fontWeight: 700, background: 'var(--lp-surface)' }} colSpan={4}>
              Totals
            </td>
            <td style={{ ...num, fontWeight: 700, background: 'var(--lp-surface)' }}>{totals.s || '—'}</td>
            <td style={{ ...num, fontWeight: 700, background: 'var(--lp-surface)' }}>{totals.d || '—'}</td>
            <td style={{ ...num, fontWeight: 700, background: 'var(--lp-surface)' }}>{totals.t || '—'}</td>
            <td style={{ ...num, fontWeight: 700, background: 'var(--lp-surface)' }}>{totals.pax || '—'}</td>
            <td style={{ ...num, fontWeight: 700, background: 'var(--lp-surface)' }}>{money(totals.cost)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
