'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

const ROOM_OPTIONS = [
  { value: 'SGL', label: 'SGL' },
  { value: 'DBL (A)', label: 'DBL (A)' },
  { value: 'DBL (B)', label: 'DBL (B)' },
  { value: 'DBL (C)', label: 'DBL (C)' },
  { value: 'DBL (D)', label: 'DBL (D)' },
  { value: '-', label: '—' },
];

function formatDateCol(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface RosterPerson {
  person_id: string | null;
  person_name: string;
  role: string;
}

interface RoomingMasterGridProps {
  tourId: string;
  currency: string;
  routingDates: { id: string; date: string; venue_name?: string; city?: string; day_type?: string }[];
  /** FOUNDATION FIX — the authoritative people list (one row per roster
   *  member), sourced from `tour_personnel`, not the rate cards. */
  roster: RosterPerson[];
}

export function RoomingMasterGrid({
  tourId,
  currency,
  routingDates,
  roster,
}: RoomingMasterGridProps) {
  const { showToast } = useToast();
  const [gridByPerson, setGridByPerson] = useState<{ person_name: string; person_id: string | null; role: string | null; entries: { id: string; routing_id: string; room_type: string; routing?: { date: string; city?: string } }[] }[]>([]);
  const [assumedRate, setAssumedRate] = useState(0);
  const [loading, setLoading] = useState(true);
  // Optimistic cell overrides (`name:routingId` → room_type), applied over
  // the fetched grid so an assignment shows instantly with no reload (OPS-04).
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
      for (const e of person.entries) {
        m.set(`${person.person_name}:${e.routing_id}`, e.room_type ?? '-');
      }
    }
    for (const [k, v] of overrides) m.set(k, v);
    return m;
  }, [gridByPerson, overrides]);

  // Room-assignment ids per person (for off-roster cleanup deletes).
  const assignmentIdsByPerson = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const person of gridByPerson) {
      const ids = Array.from(new Set(person.entries.map((e) => e.id).filter(Boolean)));
      if (ids.length) m.set(person.person_name, ids);
    }
    return m;
  }, [gridByPerson]);

  const saveCell = useCallback(
    async (personName: string, routingId: string, roomType: string) => {
      const key = `${personName}:${routingId}`;
      const prev = cellMap.get(key) ?? '-';
      if (prev === roomType) return;
      // Optimistic — show the new value immediately, persist in the
      // background, NO router.refresh / no grid reload. Revert on failure.
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
            // Persist the assumed nightly rate as the room cost so the budget
            // Accommodation line is costed (OPS-04). Omitted when unset.
            ...(assumedRate > 0 ? { cost_amount: assumedRate } : {}),
          }),
        });
        if (!res.ok) throw new Error('Save failed');
      } catch {
        setOverrides((o) => new Map(o).set(key, prev));
        showToast('Could not save room assignment', 'error');
      }
    },
    [tourId, cellMap, assumedRate, showToast]
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
      } catch {
        showToast('Could not remove assignments', 'error');
      }
    },
    [assignmentIdsByPerson, fetchGrid, showToast],
  );

  // Roster membership sets (person_id is robust; name is the fallback for
  // legacy assignments not yet linked to canonical `persons`).
  const rosterPersonIdSet = useMemo(
    () => new Set(roster.map((r) => r.person_id).filter((id): id is string => Boolean(id))),
    [roster],
  );
  const rosterNameSet = useMemo(() => new Set(roster.map((r) => r.person_name)), [roster]);

  // Roster rows — the authoritative people list, in roster order.
  const rosterPeople = useMemo(
    () => roster.map((r) => ({ person_name: r.person_name, role: r.role })),
    [roster],
  );

  // True iff this person still holds at least one room across the tour
  // (honouring optimistic edits — clearing every cell drops them).
  const holdsARoom = useCallback(
    (personName: string) => routingDates.some((r) => {
      const v = cellMap.get(`${personName}:${r.id}`) ?? '-';
      return v && v !== '-';
    }),
    [routingDates, cellMap],
  );

  // Off-roster occupants: anyone the rooming grid knows about (holds a room)
  // who is NOT on the roster. Surfaced in their own group — NEVER as a
  // phantom roster row (the Duncan bug). Matched by person_id, name fallback.
  // OPS-03/14 — only render those who still hold ≥1 room (drop at zero).
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

  // Every rendered row (roster + off-roster) for room-night maths.
  const allRows = useMemo(() => [...rosterPeople, ...offRoster], [rosterPeople, offRoster]);

  /** Room nights: SGL = one room each; each distinct DBL (A).. group on a date = one room (shared). */
  const roomNights = useMemo(() => {
    let n = 0;
      for (const r of routingDates) {
        const dblLabels = new Set<string>();
      for (const p of allRows) {
        const v = cellMap.get(`${p.person_name}:${r.id}`) ?? '-';
        if (!v || v === '-') continue;
        if (v === 'SGL') {
          n += 1;
        } else if (v.startsWith('DBL')) {
          dblLabels.add(v);
        }
      }
      n += dblLabels.size;
    }
    return n;
  }, [allRows, routingDates, cellMap]);

  const estTotal = assumedRate * roomNights;

  const renderRow = (p: { person_name: string; role: string }, onDelete?: () => void) => {
    const parts = (p.person_name ?? '').trim().split(/\s+/);
    const forename = parts[0] ?? '';
    const surname = parts.slice(1).join(' ') ?? '';
    return (
      <tr key={p.person_name} className="even:bg-lp-surface/30">
        <td className="border-b border-lp-border/30 px-2 py-1">{p.role}</td>
        <td className="border-b border-lp-border/30 px-2 py-1">{forename}</td>
        <td className="border-b border-lp-border/30 px-2 py-1">
          <span className="inline-flex items-center gap-1">
            {surname}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                title={`Remove ${p.person_name}'s room assignments`}
                aria-label={`Remove ${p.person_name}'s room assignments`}
                className="btn-transition rounded p-0.5 text-lp-text-tertiary hover:text-lp-error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </td>
        {routingDates.map((r) => {
          const value = cellMap.get(`${p.person_name}:${r.id}`) ?? '-';
          return (
            <td
              key={r.id}
              className={cn(
                'border-b border-lp-border/30 px-1 py-0',
                value === 'SGL' && 'bg-blue-500/10',
                value.startsWith('DBL') && 'bg-purple-500/10'
              )}
            >
              <InlineEditCell
                value={value}
                type="select"
                options={ROOM_OPTIONS}
                onSave={async (v) => saveCell(p.person_name, r.id, String(v))}
              />
            </td>
          );
        })}
      </tr>
    );
  };

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;

  return (
    <div className="space-y-4 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-lp-text-secondary">Assumed Rate:</span>
        <span className="tabular-nums">{currency}</span>
        <input
          type="number"
          step="0.01"
          value={assumedRate || ''}
          onChange={(e) => setAssumedRate(parseFloat(e.target.value) || 0)}
          className="w-24 rounded border border-lp-border bg-lp-surface px-2 py-1 text-right"
        />
        <span className="text-lp-text-secondary">/ Room</span>
        <span className="font-semibold text-lp-text">Est Total: {new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 }).format(estTotal)}</span>
      </div>

      <table className="w-full min-w-[800px] border-collapse text-sm">
        <thead>
          <tr className="bg-lp-surface text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-24">Role</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-24">Forename</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left w-24">Surname</th>
            {routingDates.map((r) => (
              <th key={r.id} className="border-b border-lp-border/30 px-1 py-2 text-center w-24">
                {r.city ?? '—'}
              </th>
            ))}
          </tr>
          <tr className="bg-lp-surface/50 text-xs text-lp-text-secondary">
            <td colSpan={3} className="border-b border-lp-border/30 px-2 py-1" />
            {routingDates.map((r) => (
              <td key={r.id} className="border-b border-lp-border/30 px-1 py-1 text-center">
                {(r.day_type ?? '').toUpperCase()}
              </td>
            ))}
          </tr>
          <tr className="bg-lp-surface/50 text-xs text-lp-text-secondary">
            <th className="border-b border-lp-border/30 px-2 py-2 text-left">Role</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left">Forename</th>
            <th className="border-b border-lp-border/30 px-2 py-2 text-left">Surname</th>
            {routingDates.map((r) => (
              <th key={r.id} className="border-b border-lp-border/30 px-1 py-2 text-center">
                {formatDateCol(r.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rosterPeople.map((p) => renderRow(p))}
          {offRoster.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={3 + routingDates.length}
                  className="border-b border-lp-border/30 bg-lp-surface px-2 pt-4 pb-1 text-xs font-bold uppercase tracking-wider text-lp-text-secondary"
                >
                  Off-roster / unassigned — holds a room but is not on this tour&apos;s roster
                </td>
              </tr>
              {offRoster.map((p) => renderRow(p, () => deleteOffRoster(p.person_name)))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
