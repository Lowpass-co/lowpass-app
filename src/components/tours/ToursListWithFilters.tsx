'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { capitaliseStatus } from '@/lib/utils';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import type { Tour } from '@/types';

const STATUS_OPTIONS = ['planning', 'active', 'completed', 'archived'] as const;
const TourSlideOver = dynamic(() => import('@/components/entity/tour/TourSlideOver'), { ssr: false });

export function ToursListWithFilters({ tours }: { tours: Tour[] }) {
  const { selectedArtistId, selectedArtist } = useArtistTourContext();
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  const scopedArtistId = selectedArtistId ?? '';
  const rows = useMemo(() => {
    if (!scopedArtistId) return tours;
    return tours.filter((t) => t.artist?.id === scopedArtistId);
  }, [tours, scopedArtistId]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    for (const t of tours) {
      if (t.start_date) years.add(String(new Date(t.start_date).getFullYear()));
    }
    return [...years]
      .filter((y) => y !== 'NaN')
      .sort((a, b) => Number(b) - Number(a))
      .map((y) => ({ value: y, label: y }));
  }, [tours]);

  const columns = useMemo<ColumnDef<Tour>[]>(
    () => [
      { id: 'name', header: 'Tour name', accessor: 'name', sortable: true, frozen: true },
      {
        id: 'status',
        header: 'Status',
        accessor: 'status',
        sortable: true,
        filter: { kind: 'select', options: STATUS_OPTIONS.map((s) => ({ value: s, label: capitaliseStatus(s) })) },
        cell: (value) => (
          <span className="inline-flex rounded-full border border-lp-border px-2 py-0.5 text-xs capitalize">
            {String(value)}
          </span>
        ),
      },
      { id: 'start', header: 'Start', accessor: 'start_date', sortable: true },
      { id: 'end', header: 'End', accessor: 'end_date', sortable: true },
      {
        id: 'shows',
        header: '# shows',
        accessor: () => 0,
        align: 'right',
      },
      {
        id: 'personnel',
        header: '# personnel',
        accessor: (t) => Number(t.principal_count ?? 0) + Number(t.band_count ?? 0) + Number(t.crew_count ?? 0),
        align: 'right',
      },
      {
        id: 'year',
        header: 'Year',
        accessor: (t) => String(new Date(t.start_date).getFullYear()),
        filter: { kind: 'select', options: yearOptions },
      },
    ],
    [yearOptions]
  );

  return (
    <div className="space-y-4">
      {scopedArtistId && (
        <p className="rounded-lg border border-lp-orange/30 bg-lp-orange/5 px-3 py-2 text-sm text-lp-text-secondary">
          Showing tours for{' '}
          <span className="font-semibold text-lp-text">{selectedArtist?.name ?? 'selected artist'}</span>{' '}
          only. Clear the header artist scope to see every tour.
        </p>
      )}
      <DataTable<Tour>
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search tours or artist…"
        searchAccessor={(row) => `${row.name} ${(row.artist?.name ?? '')} ${(row.status ?? '')}`}
        onRowClick={(row) => setSelectedTourId(row.id)}
        emptyState="No tours match your search or filters."
      />
      {selectedTourId ? <TourSlideOver id={selectedTourId} onClose={() => setSelectedTourId(null)} /> : null}
    </div>
  );
}
