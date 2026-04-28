'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DataTable } from '@/components/entity/DataTable';

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
  const [statusFilter, setStatusFilter] = useState<'all' | RiderPackRowVm['status']>('all');
  const [recipientFilter, setRecipientFilter] = useState<string>('all');

  const recipients = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.recipientLabel);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== 'all') out = out.filter((r) => r.status === statusFilter);
    if (recipientFilter !== 'all') out = out.filter((r) => r.recipientLabel === recipientFilter);
    return out;
  }, [rows, statusFilter, recipientFilter]);

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Pack',
        render: (r: RiderPackRowVm) => <span className="font-medium text-lp-text">{r.title || 'Untitled'}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (r: RiderPackRowVm) => <StatusPill status={r.status} />,
      },
      {
        key: 'recipient',
        header: 'Recipient',
        render: (r: RiderPackRowVm) => r.recipientLabel,
      },
      {
        key: 'lastSent',
        header: 'Last sent',
        className: 'whitespace-nowrap text-lp-text-secondary',
        render: (r: RiderPackRowVm) => r.lastSentRelative,
      },
      {
        key: 'updated',
        header: 'Updated',
        className: 'whitespace-nowrap text-lp-text-secondary',
        render: (r: RiderPackRowVm) => r.updatedRelative,
      },
    ],
    []
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

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          Status
          <select
            className="min-w-[8rem] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs text-lp-text"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="signed">Signed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          Recipient
          <select
            className="min-w-[11rem] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs text-lp-text"
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
          >
            <option value="all">All</option>
            {recipients.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable<RiderPackRowVm>
        columns={columns}
        rows={filtered}
        emptyLabel="No rider packs for this tour."
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
