'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { createDealMemo, listDealMemos, type DealMemoListFilters } from '@/lib/api/deal-memos';
import type { DealMemoStatus, DealMemoListRow } from '@/lib/types/deal-memo';
import { DataTable } from '@/components/entity/DataTable';

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
  const [filters, setFilters] = useState<DealMemoListFilters>({});
  const [scopeFilter, setScopeFilter] = useState<'' | 'show' | 'tour-wide'>('');
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
    void listDealMemos({
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.tour_id?.trim() ? { tour_id: filters.tour_id } : {}),
      ...(filters.year ? { year: filters.year } : {}),
      ...(scopeFilter === 'show' || scopeFilter === 'tour-wide' ? { scope: scopeFilter } : {}),
      ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    })
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
  }, [
    filters.status,
    filters.tour_id,
    filters.year,
    scopeFilter,
    filters.q,
  ]);

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

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Title',
        render: (r: DealMemoListRow) => <span className="font-medium">{r.title}</span>,
      },
      {
        key: 'tour',
        header: 'Tour',
        render: (r: DealMemoListRow) => r.tourName ?? '—',
      },
      {
        key: 'show',
        header: 'Show',
        render: (r: DealMemoListRow) => (r.showId ? r.showLabel ?? 'Show-linked' : 'Tour-wide'),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r: DealMemoListRow) => <StatusPill status={r.status} />,
      },
      {
        key: 'fee',
        header: 'Fee',
        className: 'text-right',
        render: (r: DealMemoListRow) =>
          r.feeAmount != null ? `${r.feeCurrency} ${Number(r.feeAmount).toLocaleString()}` : '—',
      },
      {
        key: 'sent',
        header: 'Sent',
        render: (r: DealMemoListRow) => fmt(r.sentAt),
      },
      {
        key: 'signed',
        header: 'Signed',
        render: (r: DealMemoListRow) => fmt(r.signedAt),
      },
      {
        key: 'updated',
        header: 'Updated',
        render: (r: DealMemoListRow) => fmt(r.updatedAt),
      },
    ],
    []
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

      <div className="flex flex-wrap gap-3">
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
          placeholder="Search titles…"
          value={filters.q ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm text-lp-text outline-none focus:border-lp-orange"
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: e.target.value ? (e.target.value as DealMemoStatus) : undefined,
            }))
          }
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="signed">Signed</option>
          <option value="expired">Expired</option>
        </select>
        <select
          className="min-w-[180px] rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm outline-none focus:border-lp-orange"
          value={filters.tour_id ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, tour_id: e.target.value || '' }))}
          aria-label="Filter by tour"
        >
          <option value="">All tours</option>
          {tours.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm outline-none focus:border-lp-orange"
          value={filters.year ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value || '' }))}
          aria-label="Filter by year created"
        >
          <option value="">All years</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-lp-border bg-lp-surface px-2 py-2 text-sm outline-none focus:border-lp-orange"
          value={scopeFilter}
          onChange={(e) => {
            const v = e.target.value;
            setScopeFilter(v === 'show' || v === 'tour-wide' ? v : '');
          }}
          aria-label="Scope"
        >
          <option value="">All scopes</option>
          <option value="show">Show-linked</option>
          <option value="tour-wide">Tour-wide only</option>
        </select>
      </div>

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

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-lp-text-tertiary">
        <span>Quick:</span>
        <button type="button" className="rounded border border-lp-border px-2 py-0.5" onClick={() => setFilters((f) => ({ ...f, status: undefined }))}>
          Clear status
        </button>
      </div>

      <DataTable
        rows={rows}
        emptyLabel={loading ? 'Loading…' : 'No deal memos yet'}
        onRowClick={(r) => setSelectedId(r.id)}
        columns={columns}
      />

      {selectedId ? <DealMemoSlideOver id={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
