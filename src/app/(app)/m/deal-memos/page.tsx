'use client';

import { DataTable } from '@/components/entity/DataTable';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { listDealMemos } from '@/lib/api/deal-memos';
import type { DealMemoListRow } from '@/lib/types/deal-memo';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export default function MobileDealMemosPage() {
  const router = useRouter();
  const { selectedTourId, hydrated } = useArtistTourContext();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<DealMemoListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedTourId) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      void listDealMemos({ tour_id: selectedTourId, q: q.trim() || undefined, limit: 100 })
        .then((list) => {
          if (!cancelled) setRows(list);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [selectedTourId, q]);

  const display = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(t));
  }, [q, rows]);

  if (!hydrated) return <p className="px-4 py-12 text-center text-lp-text-secondary">Loading…</p>;
  if (!selectedTourId) return <p className="px-4 py-12 text-center text-lp-text-secondary">Pick a tour first.</p>;

  const columns = [
    {
      key: 't',
      header: 'Title',
      render: (r: DealMemoListRow) => <span className="font-medium">{r.title}</span>,
    },
    {
      key: 's',
      header: 'Status',
      render: (r: DealMemoListRow) => (
        <span className="rounded-full bg-lp-bg-tertiary px-2 py-0.5 text-[11px] font-semibold uppercase">
          {r.status}
        </span>
      ),
    },
    {
      key: 'sh',
      header: 'Scope',
      render: (r: DealMemoListRow) => r.showLabel ?? '—',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-[22px] font-bold text-lp-text">Deal memos</h1>
      <p className="mt-2 text-[14px] text-lp-text-secondary">Read-only — tap to open PDF.</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter…"
        className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-[16px]"
      />
      {loading ? (
        <p className="mt-8 text-center text-lp-text-secondary">Loading…</p>
      ) : (
        <div className="mt-6">
          <DataTable<DealMemoListRow>
            columns={columns}
            rows={display}
            density="compact"
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/m/deal-memo/${r.id}`)}
            emptyLabel="No deal memos for this tour."
          />
        </div>
      )}
    </div>
  );
}
