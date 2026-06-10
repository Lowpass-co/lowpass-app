'use client';

/* ============================================
   LOWPASS — <RoomingMatrix> (Stage B view 1)

   Flipped orientation: nights DOWN the left (the shared RailNightCell — same
   night cell as <RoutingRail>, D1), people ACROSS the top. Each cell is a room
   code (SGL / DBL (A…) / —); roommates share a letter; SGL≈blue / DBL≈violet;
   a trailing Rooms column + footer total = rooms-per-night. Optimistic writes
   via the shared hook (OPS-04) → unchanged budget feed.
   ============================================ */

import { useState } from 'react';
import { X } from 'lucide-react';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { RailNightCell, type RailEntry } from '@/components/routing/RoutingRail';
import {
  ROOM_OPTIONS,
  roomCodeTint,
  useRoomingGrid,
  type RoutingNight,
  type RosterPerson,
} from './useRoomingGrid';

const RAIL_W = 210;
const PERSON_W = 96;
const ROOMS_W = 64;

function splitName(name: string): { forename: string; surname: string } {
  const parts = (name ?? '').trim().split(/\s+/);
  return { forename: parts[0] ?? '', surname: parts.slice(1).join(' ') };
}

export function RoomingMatrix({
  tourId,
  currency,
  nights,
  roster,
}: {
  tourId: string;
  currency: string;
  nights: RoutingNight[];
  roster: RosterPerson[];
}) {
  const [assumedRate, setAssumedRate] = useState(0);
  const { loading, cellOf, saveCell, offRoster, deleteOffRoster, rosterPeople, roomNights, roomNightsOn } =
    useRoomingGrid(tourId, nights, roster, assumedRate);

  if (loading) return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>Loading…</div>;

  const people = [
    ...rosterPeople.map((p) => ({ ...p, off: false })),
    ...offRoster.map((p) => ({ ...p, off: true })),
  ];
  const cols = `${RAIL_W}px repeat(${people.length}, ${PERSON_W}px) ${ROOMS_W}px`;
  const estTotal = assumedRate * roomNights;

  const headCell: React.CSSProperties = {
    padding: '8px 6px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--lp-text-secondary)',
    background: 'var(--lp-surface)',
    borderBottom: '1px solid var(--lp-border)',
    textAlign: 'center',
  };
  const stickyLeft: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--lp-panel)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* assumed rate + est total */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 13 }}>
        <span style={{ color: 'var(--lp-text-secondary)' }}>Assumed rate</span>
        <span style={{ color: 'var(--lp-text-tertiary)' }}>{currency}</span>
        <input
          type="number"
          step="0.01"
          value={assumedRate || ''}
          onChange={(e) => setAssumedRate(parseFloat(e.target.value) || 0)}
          style={{
            width: 96,
            textAlign: 'right',
            padding: '4px 8px',
            borderRadius: 'var(--lp-radius-md)',
            border: '1px solid var(--lp-border)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text)',
          }}
        />
        <span style={{ color: 'var(--lp-text-secondary)' }}>/ room · night</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--lp-text)' }}>
          Est total:{' '}
          {new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0 }).format(estTotal)}
        </span>
      </div>

      {/* the matrix */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, minWidth: 'fit-content' }}>
          {/* header row */}
          <div style={{ ...headCell, ...stickyLeft, textAlign: 'left' }}>Night</div>
          {people.map((p) => {
            const { forename, surname } = splitName(p.person_name);
            return (
              <div key={p.person_name} style={{ ...headCell, position: 'relative' }} title={`${p.person_name}${p.role ? ` · ${p.role}` : ''}`}>
                <div style={{ fontWeight: 700, color: p.off ? 'var(--lp-text-tertiary)' : 'var(--lp-text)' }}>{forename}</div>
                <div style={{ fontWeight: 500, color: 'var(--lp-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{surname}</div>
                {p.off ? (
                  <button
                    type="button"
                    title={`Remove ${p.person_name}'s rooms`}
                    aria-label={`Remove ${p.person_name}'s rooms`}
                    onClick={() => deleteOffRoster(p.person_name)}
                    style={{ position: 'absolute', top: 2, right: 2, border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-tertiary)', padding: 1 }}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            );
          })}
          <div style={{ ...headCell }}>Rooms</div>

          {/* off-roster divider note (only people row-axis; nights are rows) */}
          {nights.map((r) => {
            const entry: RailEntry = { id: r.id, date: r.date, city: r.city, venueName: r.venue_name, dayType: r.day_type };
            return (
              <Row key={r.id}>
                <div style={{ ...stickyLeft, padding: '8px 10px', borderBottom: '1px solid var(--lp-border-subtle)' }}>
                  <RailNightCell entry={entry} />
                </div>
                {people.map((p) => {
                  const v = cellOf(p.person_name, r.id);
                  return (
                    <div
                      key={p.person_name}
                      style={{
                        borderBottom: '1px solid var(--lp-border-subtle)',
                        borderLeft: '1px solid var(--lp-border-subtle)',
                        background: roomCodeTint(v),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <InlineEditCell
                        value={v}
                        type="select"
                        options={ROOM_OPTIONS}
                        onSave={async (nv) => saveCell(p.person_name, r.id, String(nv))}
                      />
                    </div>
                  );
                })}
                <div
                  style={{
                    borderBottom: '1px solid var(--lp-border-subtle)',
                    borderLeft: '1px solid var(--lp-border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--lp-text-secondary)',
                  }}
                >
                  {roomNightsOn(r.id) || ''}
                </div>
              </Row>
            );
          })}

          {/* footer total */}
          <div style={{ ...stickyLeft, padding: '8px 10px', fontWeight: 700, fontSize: 12, color: 'var(--lp-text-secondary)', background: 'var(--lp-surface)' }}>
            Total room-nights
          </div>
          <div style={{ gridColumn: `2 / ${people.length + 2}`, background: 'var(--lp-surface)' }} />
          <div style={{ background: 'var(--lp-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text)' }}>
            {roomNights}
          </div>
        </div>
      </div>
      {offRoster.length > 0 ? (
        <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
          Greyed columns are off-roster occupants (hold a room but not on this tour&apos;s roster) — removable via the ✕.
        </div>
      ) : null}
    </div>
  );
}

/** A matrix row = a display-contents wrapper so its children land in the grid. */
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'contents' }}>{children}</div>;
}
