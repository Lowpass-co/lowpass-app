'use client';

/* ============================================
   LOWPASS — <RoomingNightsOverview> (Stage B view 2)

   One row per hotel STAY (a hotels record): hotel · city · in→out · nights ·
   room-type counts (S/D/T) · pax · cost. Aggregates that hotel's rooms,
   grouping assignments by room_id so a shared room is counted + costed ONCE —
   the same collapse reconcileDerivedLines uses, so this scans the same numbers
   the derived Accommodation budget lines show. Read-only.

   Freshness: unlike Matrix/Cards (live client fetch via useRoomingGrid), this
   view renders the server-loaded `hotels` prop — grid writes call
   router.refresh() (see useRoomingGrid ROOT CAUSE note) so hotels/rooms
   created from the grid appear here without a manual reload. Every hotel row
   renders (no nights filter); a same-day stay range counts as ONE night via
   nightsSummary effectiveStay (#8).
   ============================================ */

import { useMemo } from 'react';
import { summariseHotel, type RoomingHotel } from '@/lib/rooming/nightsSummary';

export type { RoomingHotel } from '@/lib/rooming/nightsSummary';

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(`${d}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
    // revamp #19 — sits on the page (Phase-1 #12 de-box): no outer boxed
    // border/radius; the header underline + row dividers carry the structure.
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={th}>Hotel</th>
            <th style={th}>City</th>
            <th style={th}>In → Out</th>
            <th style={{ ...th, textAlign: 'right' }}>Nights</th>
            {/* revamp #19 — spell out the room types (no reason to abbreviate). */}
            <th style={{ ...th, textAlign: 'right' }}>Single</th>
            <th style={{ ...th, textAlign: 'right' }}>Double</th>
            <th style={{ ...th, textAlign: 'right' }}>Triple</th>
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
              {/* revamp #19 — an unassigned hotel (no name yet) falls back to its
                  city so the row is still identifiable, not blank. */}
              <td style={{ ...td, fontWeight: 600, color: selectedId === r.id ? 'var(--lp-orange)' : 'var(--lp-text)' }}>
                {r.hotel?.trim() ? r.hotel : (r.city?.trim() ? r.city : 'Unassigned')}
              </td>
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
