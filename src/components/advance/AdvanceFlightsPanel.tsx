'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import dynamic from 'next/dynamic';
import { listFlights } from '@/lib/api/flights';
import type { Flight } from '@/lib/types/flight';
import { formatDate } from '@/lib/utils';

const FlightSlideOver = dynamic(() => import('@/components/entity/flight/FlightSlideOver'), { ssr: false });

export function AdvanceFlightsPanel({ tourId }: { tourId: string }) {
  const [rows, setRows] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFlights(tourId);
      setRows(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tourId]);

  const columns = useMemo<ColumnDef<Flight>[]>(
    () => [
      {
        id: 'airline',
        header: 'Airline',
        accessor: (f) => f.airline ?? '',
        cell: (_v, f) => f.airline ?? '—',
      },
      {
        id: 'flight',
        header: 'Flight #',
        accessor: (f) => f.flightNumber ?? '',
        cell: (_v, f) => f.flightNumber ?? '—',
      },
      {
        id: 'route',
        header: 'Route',
        accessor: (f) => `${f.originAirport} → ${f.destinationAirport}`,
        cell: (_v, f) => `${f.originAirport} → ${f.destinationAirport}`,
      },
      {
        id: 'depart',
        header: 'Depart',
        accessor: (f) => f.departAt,
        cell: (_v, f) => formatDate(f.departAt),
      },
      {
        id: 'cost',
        header: 'Cost',
        accessor: (f) => f.costAmount ?? 0,
        className: 'text-right',
        cell: (_v, f) =>
          f.costAmount == null
            ? '—'
            : `${f.costCurrency} ${Number(f.costAmount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
    ],
    [],
  );

  return (
    <section className="space-y-2 rounded-xl border border-lp-border bg-lp-bg p-3">
      <div>
        <h2 className="text-sm font-semibold text-lp-text">Flights</h2>
        <p className="text-xs text-lp-text-tertiary">Canonical tour flights. Click a row to edit in the slide-over.</p>
      </div>
      {loading ? (
        <div className="py-4 text-sm text-lp-text-secondary">Loading flights...</div>
      ) : error ? (
        <div className="py-4 text-sm text-red-600">{error}</div>
      ) : (
        <DataTable<Flight>
          rows={rows}
          columns={columns}
          rowKey={(f) => f.id}
          density="compact"
          searchable={false}
          pagination="none"
          onRowClick={(row) => setActiveFlightId(row.id)}
          emptyState={
            <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
              No flights yet
            </div>
          }
        />
      )}
      {activeFlightId && (
        <FlightSlideOver
          id={activeFlightId}
          onClose={() => {
            setActiveFlightId(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
