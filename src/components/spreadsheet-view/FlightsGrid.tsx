'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import { cn } from '@/lib/utils';

interface FlightRow {
  id: string;
  person_name: string;
  role: string | null;
  origin_code: string | null;
  destination_code: string | null;
  proposed_cost: number;
  actual_cost: number;
  departure_date: string | null;
  airline: string | null;
  flight_number: string | null;
  leg_order: number;
}

const COLS = [
  { key: 'person_name', label: 'Name', width: '140px' },
  { key: 'origin_code', label: 'Origin', width: '80px' },
  { key: 'destination_code', label: 'Destination', width: '80px' },
  { key: 'proposed_cost', label: 'Proposed', width: '100px', align: 'right' as const },
  { key: 'actual_cost', label: 'Actual', width: '100px', align: 'right' as const },
  { key: 'departure_date', label: 'Departure Date', width: '110px' },
  { key: 'airline', label: 'Airline', width: '100px' },
  { key: 'flight_number', label: 'Flight #', width: '90px' },
  { key: 'leg_order', label: 'Leg', width: '60px', align: 'right' as const },
];

export function FlightsGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/flights?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load flights');
      const json = await res.json();
      setFlights(json.flights ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveFlight = useCallback(async (id: string, field: string, value: string | number) => {
    const res = await fetch('/api/budget/flights', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value === '' ? null : value }),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    setFlights((prev) => prev.map((f) => (f.id === id ? updated : f)));
  }, []);

  const addFlight = useCallback(async () => {
    const res = await fetch('/api/budget/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        person_name: 'New',
        leg_order: flights.length,
      }),
    });
    if (!res.ok) throw new Error('Create failed');
    const created = await res.json();
    setFlights((prev) => [...prev, created]);
  }, [tourId, flights.length]);

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  const byPerson = flights.reduce((acc, f) => {
    const name = f.person_name || '—';
    if (!acc[name]) acc[name] = [];
    acc[name].push(f);
    return acc;
  }, {} as Record<string, FlightRow[]>);

  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <GridTable columns={COLS}>
        {Object.entries(byPerson).map(([personName, list]) => (
          <Fragment key={personName}>
            {list.map((f, i) => (
              <tr
                key={f.id}
                className={cn(
                  'even:bg-lp-surface/30',
                  i === 0 && 'border-t border-lp-border/50'
                )}
              >
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.person_name}
                    type="text"
                    onSave={async (v) => saveFlight(f.id, 'person_name', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.origin_code}
                    type="text"
                    onSave={async (v) => saveFlight(f.id, 'origin_code', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.destination_code}
                    type="text"
                    onSave={async (v) => saveFlight(f.id, 'destination_code', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.proposed_cost}
                    type="currency"
                    currency={currency}
                    onSave={async (v) => saveFlight(f.id, 'proposed_cost', v)}
                    align="right"
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.actual_cost}
                    type="currency"
                    currency={currency}
                    onSave={async (v) => saveFlight(f.id, 'actual_cost', v)}
                    align="right"
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.departure_date ? f.departure_date.slice(0, 10) : null}
                    type="text"
                    onSave={async (v) => saveFlight(f.id, 'departure_date', String(v) || null)}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.airline}
                    type="text"
                    onSave={async (v) => saveFlight(f.id, 'airline', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.flight_number}
                    type="text"
                    onSave={async (v) => saveFlight(f.id, 'flight_number', String(v))}
                  />
                </td>
                <td className="px-2 py-0">
                  <InlineEditCell
                    value={f.leg_order}
                    type="number"
                    onSave={async (v) => saveFlight(f.id, 'leg_order', typeof v === 'number' ? v : parseFloat(String(v)))}
                    align="right"
                  />
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </GridTable>
      <button
        type="button"
        onClick={addFlight}
        className="text-lp-orange text-sm font-semibold hover:underline"
      >
        + Add Flight
      </button>
    </div>
  );
}
