'use client';

/* ============================================
   LOWPASS — <RoomingCards> (Stage B view 3)

   The literal <RoutingRail> (nights) on the left; the selected night's room
   CARDS on the right (occupant chips, colour-keyed by code) + an unassigned
   POOL. Assign by picking a room code for a pooled person; unassign via the
   chip ✕. Same optimistic write (saveCell) as the matrix → unchanged budget feed.
   ============================================ */

import { useState } from 'react';
import { X } from 'lucide-react';
import { RoutingRail, type RailEntry } from '@/components/routing/RoutingRail';
import { RoomingSkeleton } from '@/components/ui/SurfaceSkeletons';
import { roomCodeTint, ROOM_CODE_HUE, useRoomingGrid, type RoutingNight, type RosterPerson } from './useRoomingGrid';

const ASSIGNABLE = ['SGL', 'DBL (A)', 'DBL (B)', 'DBL (C)', 'DBL (D)'];

export function RoomingCards({
  tourId,
  nights,
  roster,
}: {
  tourId: string;
  nights: RoutingNight[];
  roster: RosterPerson[];
}) {
  const [nightId, setNightId] = useState<string | null>(nights[0]?.id ?? null);
  const { loading, cellOf, saveCell, rosterPeople, allRows } = useRoomingGrid(tourId, nights, roster, 0);

  const entries: RailEntry[] = nights.map((r) => ({
    id: r.id,
    date: r.date,
    city: r.city,
    venueName: r.venue_name,
    dayType: r.day_type,
  }));
  const night = nights.find((n) => n.id === nightId) ?? null;

  // Build cards for the selected night.
  const cards: { code: string; occupants: string[] }[] = [];
  if (night) {
    const dblByLetter = new Map<string, string[]>();
    for (const p of allRows) {
      const code = cellOf(p.person_name, night.id);
      if (code === '-') continue;
      if (code === 'SGL') {
        cards.push({ code: 'SGL', occupants: [p.person_name] });
      } else if (code.startsWith('DBL')) {
        if (!dblByLetter.has(code)) dblByLetter.set(code, []);
        dblByLetter.get(code)!.push(p.person_name);
      }
    }
    for (const [code, occ] of [...dblByLetter.entries()].sort()) cards.push({ code, occupants: occ });
  }
  const pool = night ? rosterPeople.filter((p) => cellOf(p.person_name, night.id) === '-') : [];

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* the literal rail */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-lg)',
          background: 'var(--lp-bg-deep)',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}
      >
        <RoutingRail
          entries={entries}
          selected={nightId}
          onSelect={setNightId}
          grouping="night"
          ariaLabel="Tour nights"
        />
      </div>

      {/* the night's rooms + pool */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <RoomingSkeleton />
        ) : !night ? (
          <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>Pick a night.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {cards.length === 0 ? (
                <div style={{ color: 'var(--lp-text-tertiary)', fontSize: 13 }}>No rooms assigned this night.</div>
              ) : (
                cards.map((c, i) => (
                  <div
                    key={`${c.code}:${i}`}
                    style={{
                      border: '1px solid var(--lp-border-strong)',
                      borderRadius: 'var(--lp-radius-lg)',
                      background: roomCodeTint(c.code) ?? 'var(--lp-panel)',
                      boxShadow: 'var(--lp-shadow-sm)',
                      padding: 12,
                    }}
                  >
                    {/* ROOM-01 — canonical card header: hue dot + code badge + count. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ROOM_CODE_HUE[c.code] ?? 'var(--lp-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--lp-text)' }}>{c.code}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--lp-text-tertiary)' }}>
                        {c.occupants.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {c.occupants.map((name) => (
                        <span
                          key={name}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 6px 3px 9px',
                            borderRadius: 'var(--lp-radius-full)',
                            background: 'var(--lp-surface)',
                            border: '1px solid var(--lp-border)',
                            fontSize: 12,
                            color: 'var(--lp-text)',
                          }}
                        >
                          {name}
                          <button
                            type="button"
                            title={`Remove ${name} from this room`}
                            aria-label={`Remove ${name} from this room`}
                            onClick={() => saveCell(name, night.id, '-')}
                            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-text-tertiary)', display: 'inline-flex', padding: 0 }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* unassigned pool */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--lp-text-tertiary)', marginBottom: 8 }}>
                Unassigned ({pool.length})
              </div>
              {pool.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--lp-text-tertiary)' }}>Everyone has a room this night.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pool.map((p) => (
                    <span
                      key={p.person_name}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 6px 4px 10px',
                        borderRadius: 'var(--lp-radius-full)',
                        background: 'var(--lp-panel)',
                        border: '1px dashed var(--lp-border)',
                        fontSize: 12,
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      {p.person_name}
                      <select
                        defaultValue=""
                        aria-label={`Assign a room to ${p.person_name}`}
                        onChange={(e) => {
                          const code = e.target.value;
                          e.currentTarget.value = '';
                          if (code) saveCell(p.person_name, night.id, code);
                        }}
                        style={{
                          border: '1px solid var(--lp-border)',
                          borderRadius: 'var(--lp-radius-md)',
                          background: 'var(--lp-surface)',
                          color: 'var(--lp-text)',
                          fontSize: 11,
                          padding: '2px 4px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">＋ room…</option>
                        {ASSIGNABLE.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
