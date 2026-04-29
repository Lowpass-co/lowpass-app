'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createDealMemo, listDealMemos } from '@/lib/api/deal-memos';
import type { DealMemoStatus, DealMemoListRow } from '@/lib/types/deal-memo';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';

const DealMemoSlideOver = dynamic(() => import('@/components/entity/deal-memo/DealMemoSlideOver'), { ssr: false });

export type DealMemoTourOpt = { id: string; name: string };


function StatusPill({ status }: { status: DealMemoStatus }) {
  const base = 'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase';
  if (status === 'signed')
    return <span className={base} style={{ backgroundColor: 'color-mix(in srgb, var(--lp-success) 22%, transparent)', color: 'var(--lp-success)' }}>{status}</span>;
  if (status === 'pending')
    return (
      <span className={base} style={{ backgroundColor: 'color-mix(in srgb, var(--lp-warning, #f59e0b) 22%, transparent)', color: 'var(--lp-warning, #f59e0b)' }}>
        {status}
      </span>
    );
  if (status === 'sent')
    return <span className={base} style={{ backgroundColor: 'color-mix(in srgb, var(--lp-orange) 18%, transparent)', color: 'var(--lp-orange)' }}>{status}</span>;
  return <span className={base} style={{ backgroundColor: 'var(--lp-bg-tertiary)', color: 'var(--lp-text-secondary)' }}>{status}</span>;
}

function fmt(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export function DealMemoLibraryClient({
  tours,
}: {
  tours: DealMemoTourOpt[];
}) {
  const [rows, setRows] = useState<DealMemoListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createTourId, setCreateTourId] = useState(() => tours[0]?.id ?? '');
  const [createTitle, setCreateTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listDealMemos({})
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    const ynow = new Date().getFullYear();
    ys.add(ynow + 1);
    ys.add(ynow);
    ys.add(ynow - 1);
    for (const r of rows) {
      const y = new Date(r.createdAt).getFullYear();
      if (!Number.isNaN(y)) ys.add(y);
    }
    return Array.from(ys).sort((a, b) => b - a).map(String);
  }, [rows]);

  const columns = useMemo<ColumnDef<DealMemoListRow>[]>(
    () => [
      {
        id: 'title',
        header: 'Title',
        accessor: 'title',
        sortable: true,
        frozen: true,
        cell: (value) => <span className="font-medium">{String(value)}</span>,
      },
      {
        id: 'tour',
        header: 'Tour',
        accessor: (r) => r.tourName ?? '',
        filter: { kind: 'select', options: tours.map((t) => ({ value: t.name, label: t.name })) },
        cell: (value) => String(value || '—'),
      },
      {
        id: 'show',
        header: 'Show',
        accessor: (r) => (r.showId ? r.showLabel ?? 'Show-linked' : 'Tour-wide'),
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
            { value: 'pending', label: 'pending' },
            { value: 'signed', label: 'signed' },
            { value: 'expired', label: 'expired' },
          ],
        },
        cell: (value) => <StatusPill status={value as DealMemoStatus} />,
      },
      {
        id: 'fee',
        header: 'Fee',
        align: 'right',
        accessor: (r) => r.feeAmount ?? 0,
        sortable: true,
        cell: (_, r) => (r.feeAmount != null ? `${r.feeCurrency} ${Number(r.feeAmount).toLocaleString()}` : '—'),
      },
      {
        id: 'sent',
        header: 'Sent',
        accessor: (r) => r.sentAt ?? '',
        cell: (value) => fmt((value as string) || null),
      },
      {
        id: 'signed',
        header: 'Signed',
        accessor: (r) => r.signedAt ?? '',
        cell: (value) => fmt((value as string) || null),
      },
      {
        id: 'updated',
        header: 'Updated',
        accessor: (r) => r.updatedAt,
        sortable: true,
        cell: (value) => fmt(String(value)),
      },
      {
        id: 'year',
        header: 'Year',
        accessor: (r) => String(new Date(r.createdAt).getFullYear()),
        filter: { kind: 'select', options: yearOptions.map((y) => ({ value: y, label: y })) },
      },
    ],
    [tours, yearOptions]
  );

  const submitCreate = async () => {
    const tid = createTourId || tours[0]?.id;
    const t = createTitle.trim();
    if (!tid || !t) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createDealMemo({
        tour_id: tid,
        title: t,
        show_id: null,
      });
      setRows((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setCreateTitle('');
      setSelectedId(created.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <div
        className="rounded-xl border border-lp-border/80 p-4"
        style={{ backgroundColor: 'color-mix(in srgb, var(--lp-bg-secondary) 88%, transparent)' }}
      >
        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">New deal memo</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium">
            <span className="block text-lp-text-tertiary">Tour</span>
            <select
              className="mt-1 min-w-[220px] rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm outline-none focus:border-lp-orange"
              value={createTourId}
              onChange={(e) => setCreateTourId(e.target.value)}
            >
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs font-medium">
            <span className="block text-lp-text-tertiary">Title</span>
            <input
              className="mt-1 w-full min-w-[200px] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm outline-none focus:border-lp-orange"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="e.g. O2 Arena — headline fee"
            />
          </label>
          <button
            type="button"
            disabled={creating || tours.length === 0 || createTitle.trim() === ''}
            onClick={() => void submitCreate()}
            className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create memo'}
          </button>
        </div>
      </div>

      <DataTable
        rows={loading ? undefined : rows}
        rowKey={(row) => row.id}
        emptyState="No deal memos yet"
        onRowClick={(r) => setSelectedId(r.id)}
        columns={columns}
        searchPlaceholder="Search deal memos…"
      />

      {selectedId ? <DealMemoSlideOver id={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
