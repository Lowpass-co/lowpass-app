'use client';

/* ============================================
   LOWPASS — <RoomingMatrix> (rebuilt ON the canonical <Grid>, wide mode)

   people = rows (frozen person column), nights = day dropdown columns
   (ROOM_OPTIONS, optColors → cell-fill tint). Native drag-select + ring +
   tokens inherited from <Grid>. Writes still go through useRoomingGrid
   (saveCell) → the budget Accommodation feed + shared-room letter counting are
   UNCHANGED (view layer only). Off-roster people render as greyed rows + a
   remove strip. Rooms-per-night is a per-column footer.
   ============================================ */

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Grid } from '@/components/grid/Grid';
import type { Column, Row, Section } from '@/components/grid/types';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { ROOM_OPTIONS, useRoomingGrid, type RoutingNight, type RosterPerson } from './useRoomingGrid';

const ROOM_CODES = ROOM_OPTIONS.map((o) => o.value);
const ROOM_OPTCOLORS: Record<string, string> = {
  SGL: 'var(--color-lp-day-travel)',
  'DBL (A)': 'var(--color-lp-day-rehearsal)',
  'DBL (B)': 'var(--color-lp-day-rehearsal)',
  'DBL (C)': 'var(--color-lp-day-rehearsal)',
  'DBL (D)': 'var(--color-lp-day-rehearsal)',
};

function DayHeader({ night }: { night: RoutingNight }) {
  const dt = (night.day_type ?? '').trim();
  const d = night.date ? night.date.slice(5) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, lineHeight: 1.15, padding: '2px 0' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--lp-text)' }}>{d}</span>
      {night.city ? <span style={{ fontSize: 9, color: 'var(--lp-text-tertiary)', maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis' }}>{night.city}</span> : null}
      {dt ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 600, color: colourForDayType(dt) }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: colourForDayType(dt) }} />
          {labelForDayType(dt) || dt}
        </span>
      ) : null}
    </div>
  );
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

  const nightById = useMemo(() => new Map(nights.map((n) => [n.id, n])), [nights]);
  const people = useMemo(
    () => [
      ...rosterPeople.map((p) => ({ name: p.person_name, off: false })),
      ...offRoster.map((p) => ({ name: p.person_name, off: true })),
    ],
    [rosterPeople, offRoster],
  );

  const columns: Column[] = useMemo(
    () => [
      { id: 'person', label: 'Person', type: 'text', ro: true, w: 180, min: 130, resize: true },
      ...nights.map<Column>((n) => ({ id: n.id, label: n.date?.slice(5) ?? n.id, type: 'dropdown', options: ROOM_CODES, optColors: ROOM_OPTCOLORS, optLabels: { '-': '—' }, w: 88, min: 72, resize: true })),
    ],
    [nights],
  );

  const data: Section[] = useMemo(() => {
    const rows: Row[] = people.map((p) => {
      const row: Row = { _uid: p.name, person: p.name };
      if (p.off) row._rowClass = 'offroster';
      for (const n of nights) row[n.id] = cellOf(p.name, n.id);
      return row;
    });
    return [{ name: 'Roster', kind: 'normal', _uid: 'rooming', rows }];
  }, [people, nights, cellOf]);

  const estTotal = assumedRate * roomNights;

  if (loading) return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 13 }}>
        <span style={{ color: 'var(--lp-text-secondary)' }}>Assumed rate</span>
        <span style={{ color: 'var(--lp-text-tertiary)' }}>{currency}</span>
        <input
          type="number"
          step="0.01"
          value={assumedRate || ''}
          onChange={(e) => setAssumedRate(parseFloat(e.target.value) || 0)}
          style={{ width: 96, textAlign: 'right', padding: '4px 8px', borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }}
        />
        <span style={{ color: 'var(--lp-text-secondary)' }}>/ room · night</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--lp-text)' }}>
          Est total: {new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0 }).format(estTotal)}
        </span>
      </div>

      {offRoster.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: 'var(--lp-text-tertiary)' }}>Off-roster (holds a room, not on this tour):</span>
          {offRoster.map((p) => (
            <span key={p.person_name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 9px', borderRadius: 'var(--lp-radius-full)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', color: 'var(--lp-text-secondary)' }}>
              {p.person_name}
              <button type="button" title={`Remove ${p.person_name}'s rooms`} aria-label={`Remove ${p.person_name}'s rooms`} onClick={() => deleteOffRoster(p.person_name)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-tertiary)', display: 'inline-flex', padding: 0 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Grid
        key={`rooming:${tourId}:${people.length}:${nights.length}`}
        initialColumns={columns}
        initialData={data}
        wide
        frozenCols={1}
        allowAddRows={false}
        onEdit={(personName, colId, value) => {
          if (colId === 'person') return;
          saveCell(String(personName), colId, String(value));
        }}
        headerFor={(colId) => {
          if (colId === 'person') return 'Person';
          const n = nightById.get(colId);
          return n ? <DayHeader night={n} /> : colId;
        }}
        columnFooter={(colId) => {
          if (colId === 'person') return 'Rooms / night';
          return roomNightsOn(colId) || '';
        }}
      />
    </div>
  );
}
