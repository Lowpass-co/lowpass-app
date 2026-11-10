'use client';

/* Production › Parking — the tour's shows and their parking maps (Nov 2026). */

import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import { PageTitle } from '@/components/ui/PageHeader';
import type { ParkingIndexRow } from '@/server/parking/maps';

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtStamp = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function ParkingIndex({ tourId, rows }: { tourId: string; rows: ParkingIndexRow[] }) {
  const router = useRouter();
  const drawn = rows.filter((r) => r.hasMap).length;
  const columns: ColumnDef<ParkingIndexRow>[] = [
    { id: 'date', header: 'Date', accessor: 'date', sortable: true, width: 130, cell: (v) => fmtDate(String(v)) },
    {
      id: 'venue',
      header: 'Venue',
      accessor: (r) => r.venue ?? r.city ?? '',
      flex: true,
      cell: (_v, r) => (
        <span>
          {r.venue ?? '—'}
          {r.city ? <span style={{ color: 'var(--lp-text-tertiary)' }}> · {r.city}</span> : null}
        </span>
      ),
    },
    {
      id: 'map',
      header: 'Parking map',
      accessor: (r) => r.summary ?? (r.hasMap ? 'Started' : ''),
      cell: (_v, r) =>
        r.hasMap ? (
          <span>{r.summary ?? 'Started'}</span>
        ) : (
          <span style={{ color: 'var(--lp-text-tertiary)' }}>Not drawn</span>
        ),
    },
    {
      id: 'pdf',
      header: 'PDF',
      accessor: (r) => r.pdfExportedAt ?? '',
      width: 110,
      cell: (_v, r) => (r.pdfExportedAt ? fmtStamp(r.pdfExportedAt) : <span style={{ color: 'var(--lp-text-tertiary)' }}>—</span>),
    },
  ];
  return (
    <div style={{ padding: 'var(--lp-space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      <div>
        <PageTitle style={{ margin: 0 }}>Parking</PageTitle>
        <p style={{ margin: 'var(--lp-space-1) 0 0', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)' }}>
          Where the buses and trucks go at each show, drawn at true size on the satellite map and sent to drivers as a PDF.
          {rows.length ? ` ${drawn} of ${rows.length} drawn.` : ''}
        </p>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.routingId}
        onRowClick={(r) => router.push(`/operations/${tourId}/parking/${r.routingId}`)}
        searchPlaceholder="Search shows"
        pagination="none"
        flat
        emptyState="No show days on this tour yet — add them in Tour settings › Dates & routing."
        ariaLabel="Shows and their parking maps"
      />
    </div>
  );
}
