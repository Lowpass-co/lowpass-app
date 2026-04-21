'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
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

interface RoomingMasterGridProps {
  tourId: string;
  currency: string;
  routingDates: { id: string; date: string; venue_name?: string; city?: string; day_type?: string }[];
  personnelRates: Record<string, unknown>[];
}

export function RoomingMasterGrid({
  tourId,
  currency,
  routingDates,
  personnelRates,
}: RoomingMasterGridProps) {
  const [gridByPerson, setGridByPerson] = useState<{ person_name: string; role: string | null; entries: { routing_id: string; room_type: string; routing?: { date: string; city?: string } }[] }[]>([]);
  const [assumedRate, setAssumedRate] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budget/rooming?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load rooming');
      const json = await res.json();
      setGridByPerson(json.grid_by_person ?? []);
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
    return m;
  }, [gridByPerson]);

  const saveCell = useCallback(
    async (personName: string, routingId: string, roomType: string) => {
      const res = await fetch('/api/budget/rooming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          person_name: personName,
          routing_id: routingId,
          room_type: roomType,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      fetchGrid();
    },
    [tourId, fetchGrid]
  );

  const people = useMemo(() => {
    const fromGrid = new Set(gridByPerson.map((p) => p.person_name));
    for (const pr of personnelRates) {
      const name = (pr.person_name as string) ?? '';
      if (name && !fromGrid.has(name)) fromGrid.add(name);
    }
    const list = Array.from(fromGrid);
    list.sort();
    return list.map((person_name) => {
      const gridPerson = gridByPerson.find((p) => p.person_name === person_name);
      const pr = personnelRates.find((p) => (p.person_name as string) === person_name);
      const role = (gridPerson?.role ?? pr?.role ?? '') as string;
      return { person_name, role };
    });
  }, [gridByPerson, personnelRates]);

  const nonDashCount = useMemo(() => {
    let n = 0;
    for (const p of people) {
      for (const r of routingDates) {
        const v = cellMap.get(`${p.person_name}:${r.id}`);
        if (v && v !== '-') n++;
      }
    }
    return n;
  }, [people, routingDates, cellMap]);

  const estTotal = assumedRate * nonDashCount;

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
          {people.map((p) => {
            const parts = (p.person_name ?? '').trim().split(/\s+/);
            const forename = parts[0] ?? '';
            const surname = parts.slice(1).join(' ') ?? '';
            return (
              <tr key={p.person_name} className="even:bg-lp-surface/30">
                <td className="border-b border-lp-border/30 px-2 py-1">{p.role}</td>
                <td className="border-b border-lp-border/30 px-2 py-1">{forename}</td>
                <td className="border-b border-lp-border/30 px-2 py-1">{surname}</td>
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
          })}
        </tbody>
      </table>
    </div>
  );
}
