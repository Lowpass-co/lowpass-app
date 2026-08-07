'use client';

/* ============================================
   LOWPASS — useRoomingGrid (shared rooming data layer)

   Extracted from RoomingMasterGrid so the Matrix + Cards views share ONE copy
   of the fetch / optimistic cell write (OPS-04) / off-roster (OPS-03/14) logic.
   The write path is UNCHANGED — same POST/DELETE /api/budget/rooming, single
   per-cell room code → rooms row + room_assignment — so the derived budget
   Accommodation feed (reconcile → hotel_booking) stays identical.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

export const ROOM_OPTIONS = [
  { value: 'SGL', label: 'SGL' },
  { value: 'DBL (A)', label: 'DBL (A)' },
  { value: 'DBL (B)', label: 'DBL (B)' },
  { value: 'DBL (C)', label: 'DBL (C)' },
  { value: 'DBL (D)', label: 'DBL (D)' },
  { value: '-', label: '—' },
];

export interface RosterPerson {
  person_id: string | null;
  person_name: string;
  role: string;
}
export interface RoutingNight {
  id: string;
  date: string;
  venue_name?: string;
  city?: string;
  day_type?: string;
}

/** Nights away = every routing date EXCEPT an explicit home / no-tour day.
 *  Off · travel · show · rehearsal · checkout (—) all count — you still sleep
 *  away. (Q2: rooming filter = nights-away, NOT shows-only like Advance.) */
const HOME_TYPES = new Set(['home', 'no-tour', 'no_tour', 'off-tour', 'day-home']);
export function isNightAway(dayType?: string): boolean {
  const first = (dayType ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return !HOME_TYPES.has(first);
}

/** MTX-03 — ONE token-based hue per room code so a matrix is scannable by
 *  colour (previously SGL=blue, every DBL=violet → indistinguishable). The
 *  matrix uses these solid hues as cell-fill `optColors`; the Cards view tints
 *  them via `roomCodeTint`. Token-clean (canonical day hues). */
export const ROOM_CODE_HUE: Record<string, string> = {
  SGL: 'var(--color-lp-day-travel)', // blue
  'DBL (A)': 'var(--color-lp-day-show)', // green
  'DBL (B)': 'var(--color-lp-day-press)', // pink
  'DBL (C)': 'var(--color-lp-day-radio)', // amber
  'DBL (D)': 'var(--color-lp-day-tv)', // red
};

/** Colour-key a room code via tokens — the Cards-view tint (the matrix uses the
 *  solid `ROOM_CODE_HUE` directly as its dropdown `optColors`). Token-clean. */
export function roomCodeTint(code: string): string | undefined {
  const hue = ROOM_CODE_HUE[code];
  if (!hue) return undefined;
  return `color-mix(in srgb, ${hue} 16%, transparent)`;
}

interface GridPerson {
  person_name: string;
  person_id: string | null;
  role: string | null;
  entries: { id: string; routing_id: string; room_type: string }[];
}

export function useRoomingGrid(
  tourId: string,
  nights: RoutingNight[],
  roster: RosterPerson[],
  assumedRate: number,
) {
  const { showToast } = useToast();
  // ROOT CAUSE (Adam's "rooms don't show on the Nights tab"): Matrix + Cards
  // read LIVE data (this hook's GET /api/budget/rooming), but the Nights view
  // renders the `hotels` prop the SERVER component loaded at page render.
  // Grid writes (POST/DELETE below) never invalidated that RSC snapshot, so
  // hotels/rooms created from the grid — including the auto placeholder
  // hotels — stayed invisible on Nights until a full browser reload.
  // Fix: router.refresh() after every successful write re-fetches the server
  // payload in place (client state, incl. the selected tab, is preserved).
  const router = useRouter();
  const [gridByPerson, setGridByPerson] = useState<GridPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budget/rooming?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load rooming');
      const json = await res.json();
      setGridByPerson(json.grid_by_person ?? []);
      setOverrides(new Map());
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchGrid();
  }, [fetchGrid]);

  const cellMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const person of gridByPerson) {
      for (const e of person.entries) m.set(`${person.person_name}:${e.routing_id}`, e.room_type ?? '-');
    }
    for (const [k, v] of overrides) m.set(k, v);
    return m;
  }, [gridByPerson, overrides]);

  const assignmentIdsByPerson = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const person of gridByPerson) {
      const ids = Array.from(new Set(person.entries.map((e) => e.id).filter(Boolean)));
      if (ids.length) m.set(person.person_name, ids);
    }
    return m;
  }, [gridByPerson]);

  const cellOf = useCallback(
    (personName: string, routingId: string) => cellMap.get(`${personName}:${routingId}`) ?? '-',
    [cellMap],
  );

  const saveCell = useCallback(
    async (personName: string, routingId: string, roomType: string) => {
      const key = `${personName}:${routingId}`;
      const prev = cellMap.get(key) ?? '-';
      if (prev === roomType) return;
      // Optimistic (OPS-04) — show immediately, persist in the background.
      setOverrides((o) => new Map(o).set(key, roomType));
      try {
        const res = await fetch('/api/budget/rooming', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tour_id: tourId,
            person_name: personName,
            routing_id: routingId,
            room_type: roomType,
            ...(assumedRate > 0 ? { cost_amount: assumedRate } : {}),
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        // Keep the server-rendered Nights view in sync (see ROOT CAUSE above).
        router.refresh();
      } catch {
        setOverrides((o) => new Map(o).set(key, prev));
        showToast('Could not save room assignment', 'error');
      }
    },
    [tourId, cellMap, assumedRate, showToast, router],
  );

  const deleteOffRoster = useCallback(
    async (personName: string) => {
      const ids = assignmentIdsByPerson.get(personName) ?? [];
      if (ids.length === 0) return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch('/api/budget/rooming', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            }),
          ),
        );
        showToast(`Removed ${personName}'s room assignments.`);
        fetchGrid();
        // Keep the server-rendered Nights view in sync (see ROOT CAUSE above).
        router.refresh();
      } catch {
        showToast('Could not remove assignments', 'error');
      }
    },
    [assignmentIdsByPerson, fetchGrid, showToast, router],
  );

  const rosterPersonIdSet = useMemo(
    () => new Set(roster.map((r) => r.person_id).filter((id): id is string => Boolean(id))),
    [roster],
  );
  const rosterNameSet = useMemo(() => new Set(roster.map((r) => r.person_name)), [roster]);
  const rosterPeople = useMemo(
    () => roster.map((r) => ({ person_name: r.person_name, role: r.role })),
    [roster],
  );

  const holdsARoom = useCallback(
    (personName: string) => nights.some((r) => cellOf(personName, r.id) !== '-'),
    [nights, cellOf],
  );

  const offRoster = useMemo(() => {
    const seen = new Set<string>();
    const out: { person_name: string; role: string }[] = [];
    for (const g of gridByPerson) {
      const onRoster = (g.person_id && rosterPersonIdSet.has(g.person_id)) || rosterNameSet.has(g.person_name);
      if (onRoster || seen.has(g.person_name)) continue;
      seen.add(g.person_name);
      if (!holdsARoom(g.person_name)) continue;
      out.push({ person_name: g.person_name, role: (g.role ?? '') as string });
    }
    return out;
  }, [gridByPerson, rosterPersonIdSet, rosterNameSet, holdsARoom]);

  const allRows = useMemo(() => [...rosterPeople, ...offRoster], [rosterPeople, offRoster]);

  /** SGL = one room each; each distinct DBL (A).. on a night = one shared room. */
  const roomNightsOn = useCallback(
    (routingId: string) => {
      let n = 0;
      const dbl = new Set<string>();
      for (const p of allRows) {
        const v = cellOf(p.person_name, routingId);
        if (v === '-') continue;
        if (v === 'SGL') n += 1;
        else if (v.startsWith('DBL')) dbl.add(v);
      }
      return n + dbl.size;
    },
    [allRows, cellOf],
  );

  const roomNights = useMemo(
    () => nights.reduce((sum, r) => sum + roomNightsOn(r.id), 0),
    [nights, roomNightsOn],
  );

  return {
    loading,
    cellMap,
    cellOf,
    saveCell,
    offRoster,
    deleteOffRoster,
    rosterPeople,
    allRows,
    roomNights,
    roomNightsOn,
    refetch: fetchGrid,
  };
}
