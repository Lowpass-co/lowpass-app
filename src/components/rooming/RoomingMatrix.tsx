'use client';
import { RoomingSkeleton } from '@/components/ui/SurfaceSkeletons';

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
import { dayTypeSwatch } from '@/lib/sheetPalette';
import { ROOM_OPTIONS, ROOM_FILL, useRoomingGrid, type RoutingNight, type RosterPerson } from './useRoomingGrid';

const ROOM_CODES = ROOM_OPTIONS.map((o) => o.value);
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 14 Oct" from an ISO date, without a timezone shift. */
function nightLabel(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH[m - 1]}`;
}

/** "Sam Whitfield-Jones" → ["Sam", "Whitfield-Jones"]; one word → [word, ""]. */
export function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return [parts[0] ?? '', ''];
  return [parts[0], parts.slice(1).join(' ')];
}

/** Like Adam's sheet: the date, the city, then the day type in its colour. */
function NightHeader({ night }: { night: RoutingNight }) {
  const sw = dayTypeSwatch(night.day_type);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, width: '100%', lineHeight: 1.2, padding: '4px 0 0', textTransform: 'none', letterSpacing: 0 }}>
      <span style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 700, color: 'var(--lp-text)', textAlign: 'center' }}>{nightLabel(night.date)}</span>
      <span
        title={night.city ?? undefined}
        style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 500, color: 'var(--lp-text-secondary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {night.city || '\u00a0'}
      </span>
      <span
        style={{
          fontSize: 'var(--lp-text-2xs)', fontWeight: 800, letterSpacing: '0.04em', textAlign: 'center', padding: '2px 0',
          background: sw?.bg ?? 'transparent', color: sw?.fg ?? 'var(--lp-text-tertiary)',
        }}
      >
        {sw?.label ?? '\u00a0'}
      </span>
    </div>
  );
}

/** One big figure in the header band. */
function BandFigure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7 }}>{label}</span>
      <span style={{ fontSize: 'var(--lp-text-2xl)', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{children}</span>
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
      ...rosterPeople.map((p) => ({ name: p.person_name, role: p.role ?? '', off: false })),
      ...offRoster.map((p) => ({ name: p.person_name, role: p.role ?? '', off: true })),
    ],
    [rosterPeople, offRoster],
  );

  // Oct 2026 — Adam's sheet columns: Role · Forename · Surname, all frozen.
  // The row key stays the full name (the write path keys on person_name).
  const columns: Column[] = useMemo(
    () => [
      { id: 'role', label: 'Role', type: 'text', ro: true, w: 150, min: 90, resize: true },
      { id: 'forename', label: 'Forename', type: 'text', ro: true, w: 110, min: 80, resize: true },
      { id: 'surname', label: 'Surname', type: 'text', ro: true, w: 170, min: 80, resize: true },
      ...nights.map<Column>((n) => ({ id: n.id, label: n.date?.slice(5) ?? n.id, type: 'dropdown', options: ROOM_CODES, optFill: ROOM_FILL, optLabels: { '-': '—' }, w: 104, min: 80, resize: true })),
    ],
    [nights],
  );

  const data: Section[] = useMemo(() => {
    const rows: Row[] = people.map((p) => {
      const [forename, surname] = splitName(p.name);
      const row: Row = { _uid: p.name, role: p.role, forename, surname };
      if (p.off) row._rowClass = 'offroster';
      for (const n of nights) row[n.id] = cellOf(p.name, n.id);
      return row;
    });
    return [{ name: 'Roster', kind: 'normal', _uid: 'rooming', rows }];
  }, [people, nights, cellOf]);

  const estTotal = assumedRate * roomNights;

  if (loading) return <RoomingSkeleton />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Oct 2026 — Adam's sheet header block: the rate, the estimate and the
          room count, large, in the black title band. The rate is the nightly
          price written onto every room you set from here on (useRoomingGrid →
          cost_amount → the budget); it isn't remembered between visits. */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 28, padding: '12px 16px',
          borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-sheet-band-bg)', color: 'var(--lp-sheet-band-fg)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label htmlFor="rooming-rate" style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.7 }}>
            Assumed rate / room-night
          </label>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 'var(--lp-text-base)', fontWeight: 700, opacity: 0.7 }}>{currency}</span>
            <input
              id="rooming-rate"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={assumedRate || ''}
              onChange={(e) => setAssumedRate(parseFloat(e.target.value) || 0)}
              title="Written onto every room you set from here on. Not remembered between visits."
              style={{
                width: 120, fontSize: 'var(--lp-text-2xl)', fontWeight: 800, padding: '2px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                borderRadius: 'var(--lp-radius-md)', border: '1px solid color-mix(in srgb, var(--lp-sheet-band-fg) 35%, transparent)',
                background: 'color-mix(in srgb, var(--lp-sheet-band-fg) 10%, transparent)', color: 'var(--lp-sheet-band-fg)',
              }}
            />
          </span>
        </div>
        <BandFigure label="Estimated total">
          {assumedRate > 0 ? new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0 }).format(estTotal) : '—'}
        </BandFigure>
        <BandFigure label="Room-nights">{roomNights}</BandFigure>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--lp-text-xs)', opacity: 0.7, maxWidth: 320 }}>
          The rate is written onto each room you set from here on. Room colours: SGL, then one colour per shared room (DBL A–D).
        </span>
      </div>

      {offRoster.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 'var(--lp-text-xs)' }}>
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
        bare
        frozenCols={3}
        allowAddRows={false}
        fillHandle
        clickTwiceToOpen
        tabOpensMenu
        onEdit={(personName, colId, value) => {
          if (colId === 'role' || colId === 'forename' || colId === 'surname') return;
          saveCell(String(personName), colId, String(value));
        }}
        headerFor={(colId) => {
          if (colId === 'role') return 'Role';
          if (colId === 'forename') return 'Forename';
          if (colId === 'surname') return 'Surname';
          const n = nightById.get(colId);
          return n ? <NightHeader night={n} /> : colId;
        }}
        columnFooter={(colId) => {
          if (colId === 'role') return 'Rooms / night';
          if (colId === 'forename' || colId === 'surname') return '';
          return roomNightsOn(colId) || '';
        }}
      />
    </div>
  );
}
