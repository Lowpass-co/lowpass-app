'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import type { RiderPackRowVm } from './rider-pack-rows';

export type { RiderPackRowVm } from './rider-pack-rows';

const RiderPackDetailsSlideOver = dynamic(
  () => import('@/components/entity/rider-pack/RiderPackDetailsSlideOver'),
  { ssr: false }
);

export function RiderPacksTourClient({ tourId, tourName, rows: initialRows }: { tourId: string; tourName: string; rows: RiderPackRowVm[] }) {
  const router = useRouter();
  // Local copy so a delete removes the row optimistically (then router.refresh()
  // re-fetches the server list).
  const [rows, setRows] = useState<RiderPackRowVm[]>(initialRows);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const recipients = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.recipientLabel);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const columns = useMemo<ColumnDef<RiderPackRowVm>[]>(
    () => [
      {
        id: 'name',
        header: 'Pack',
        accessor: (r) => r.title ?? '',
        sortable: true,
        frozen: true,
        cell: (value) => <span className="font-medium text-lp-text">{String(value || 'Untitled')}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: 'status',
        filter: {
          kind: 'select',
          options: [
            { value: 'draft', label: 'draft' },
            { value: 'sent', label: 'sent' },
            { value: 'signed', label: 'signed' },
          ],
        },
        cell: (value) => <StatusPill status={value as RiderPackRowVm['status']} />,
      },
      {
        id: 'recipient',
        header: 'Recipient',
        accessor: (r) => r.recipientLabel,
        filter: { kind: 'select', options: recipients.map((x) => ({ value: x, label: x })) },
      },
      {
        id: 'lastSent',
        header: 'Last sent',
        accessor: (r) => r.lastSentRelative,
        className: 'whitespace-nowrap',
        cell: (value) => <span className="text-lp-text-secondary">{String(value)}</span>,
      },
      {
        id: 'updated',
        header: 'Updated',
        accessor: (r) => r.updatedRelative,
        className: 'whitespace-nowrap',
        cell: (value) => <span className="text-lp-text-secondary">{String(value)}</span>,
      },
      {
        id: 'details',
        header: '',
        accessor: (r) => r.id,
        align: 'right',
        cell: (_, row) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailsId(row.id);
            }}
            className="rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-bg-tertiary"
          >
            ...
          </button>
        ),
      },
    ],
    [recipients]
  );

  return (
    <div className="mx-auto flex min-h-0 max-w-5xl flex-1 flex-col space-y-5 pb-12">
      <div>
        <p className="text-xs uppercase tracking-wide text-lp-text-tertiary">
          <Link href={`/tours/${tourId}`} className="hover:text-lp-text">
            {tourName}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-lp-text">Rider packs</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">Open a pack to edit the full canvas.</p>
      </div>

      <DataTable<RiderPackRowVm>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        searchPlaceholder="Search rider packs…"
        emptyState="No rider packs for this tour."
        onRowClick={(row) => {
          // Direct push into Operations (no /tours redirect hop). The legacy
          // /tours/[id]/rider-packs/[packId] redirect also resolves now that the
          // operations editor page exists.
          router.push(`/operations/${tourId}/riders/${row.id}`);
        }}
      />

      {/* IA Cleanup §I1.2 — workspace-wide /rider-packs is
          deprecated. Riders live per-artist now. */}
      {detailsId
        ? (() => {
            const row = rows.find((r) => r.id === detailsId);
            if (!row) return null;
            return (
              <RiderPackDetailsSlideOver
                pack={row}
                onClose={() => setDetailsId(null)}
                onDeleted={() => {
                  setRows((prev) => prev.filter((r) => r.id !== row.id));
                  setDetailsId(null);
                  router.refresh();
                }}
              />
            );
          })()
        : null}
    </div>
  );
}

function StatusPill({ status }: { status: RiderPackRowVm['status'] }) {
  const styles: Record<RiderPackRowVm['status'], { bg: string; fg: string; label: string }> = {
    draft: { bg: 'var(--lp-surface-muted, #374151)', fg: 'var(--lp-text)', label: 'Draft' },
    sent: { bg: '#FF45001a', fg: 'var(--lp-orange)', label: 'Sent' },
    signed: { bg: 'var(--lp-success-bg, rgba(34,197,94,0.12))', fg: 'var(--lp-success)', label: 'Signed' },
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

