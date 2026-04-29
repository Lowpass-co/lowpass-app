'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';

export type RiderPackRowVm = {
  id: string;
  title: string | null;
  status: 'draft' | 'sent' | 'signed';
  recipientLabel: string;
  artistName: string;
  scope: string;
  lastSentRelative: string;
  updatedRelative: string;
  updatedIso: string;
};
const RiderPackDetailsSlideOver = dynamic(
  () => import('@/components/entity/rider-pack/RiderPackDetailsSlideOver'),
  { ssr: false }
);

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const delta = Date.now() - d.getTime();
    const mins = Math.floor(delta / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

export function RiderPacksTourClient({ tourId, tourName, rows }: { tourId: string; tourName: string; rows: RiderPackRowVm[] }) {
  const router = useRouter();
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
          router.push(`/tours/${tourId}/rider-packs/${row.id}`);
        }}
      />

      <p className="text-xs text-lp-text-tertiary">
        Need the workspace-wide grid?{' '}
        <Link href="/rider-packs" className="underline hover:text-lp-orange">
          Open global rider packs
        </Link>
        .
      </p>
      {detailsId
        ? (() => {
            const row = rows.find((r) => r.id === detailsId);
            if (!row) return null;
            return <RiderPackDetailsSlideOver pack={row} onClose={() => setDetailsId(null)} />;
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

export function riderPackRowsFromServer(
  packs: Array<{
    id: string;
    artist_id?: string;
    title: string | null;
    scope: string;
    updated_at: string;
    artists?: { name: string | null } | null;
    rider_pack_exports?: Array<{ exported_at: string; export_type: string }> | null;
  }>,
  artistFallback: Map<string, string>,
): RiderPackRowVm[] {
  return packs.map((p) => {
    const exports = [...(p.rider_pack_exports ?? [])].sort(
      (a, b) => new Date(b.exported_at).getTime() - new Date(a.exported_at).getTime(),
    );
    const latest = exports[0];
    let status: RiderPackRowVm['status'] = 'draft';
    if (latest) {
      if (latest.export_type === 'web_link') status = 'signed';
      else if (latest.export_type === 'google_doc') status = 'sent';
    }
    const artistId = (p as { artist_id?: string }).artist_id;
    const artistName =
      (p.artists as { name?: string | null } | undefined)?.name ??
      (artistId ? artistFallback.get(artistId) : undefined) ??
      'Artist';
    const recipientLabel =
      p.scope === 'show'
        ? 'Production / show-level'
        : p.scope === 'tour'
          ? `${artistName} (tour)`
          : `${artistName} (artist)`;
    const lastSent = exports.reduce<string | null>(
      (acc, e) =>
        acc == null || new Date(e.exported_at).getTime() > new Date(acc).getTime() ? e.exported_at : acc,
      null,
    );
    return {
      id: p.id,
      title: p.title,
      status,
      recipientLabel,
      artistName,
      scope: p.scope,
      lastSentRelative: lastSent ? formatRelative(lastSent) : '—',
      updatedRelative: formatRelative(p.updated_at),
      updatedIso: p.updated_at,
    };
  });
}
