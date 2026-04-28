'use client';

import { DataTable } from '@/components/entity/DataTable';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { hasFileBlob } from '@/lib/mobile/offline-file-blob-cache';
import type { FileVm } from '@/lib/tour-files/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function MobileTourFilesPage() {
  const router = useRouter();
  const { selectedTourId, tourRouting, hydrated } = useArtistTourContext();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<FileVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheHint, setCacheHint] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!selectedTourId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tours/${selectedTourId}/files-json`);
      if (!res.ok) throw new Error('Failed');
      const j = (await res.json()) as { files: FileVm[] };
      setRows(j.files ?? []);
      const next = new Set<string>();
      await Promise.all(
        (j.files ?? []).map(async (f) => {
          const ck = `${selectedTourId}::${encodeURIComponent(f.id)}`;
          if (await hasFileBlob(ck)) next.add(f.id);
        })
      );
      setCacheHint(next);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTourId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.filename.toLowerCase().includes(t) || r.linkedSummary.toLowerCase().includes(t));
  }, [q, rows]);

  const defaultRouting = tourRouting[0]?.id ?? 'list';

  const openFile = useCallback(
    (row: FileVm) => {
      if (!selectedTourId) return;
      const rid = row.showId ?? defaultRouting;
      router.push(`/m/show/${rid}/file/${encodeURIComponent(row.id)}`);
    },
    [defaultRouting, router, selectedTourId]
  );

  if (!hydrated) return <p className="px-4 py-12 text-center text-lp-text-secondary">Loading…</p>;
  if (!selectedTourId) return <p className="px-4 py-12 text-center text-lp-text-secondary">Pick a tour scope first.</p>;

  const columns = [
    {
      key: 'n',
      header: 'Name',
      render: (row: FileVm) => (
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{row.filename}</span>
          {cacheHint.has(row.id) ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Cached offline" />
          ) : null}
        </span>
      ),
    },
    {
      key: 'tag',
      header: 'Tag',
      className: 'whitespace-nowrap',
      render: (row: FileVm) => row.source,
    },
    {
      key: 'ref',
      header: 'Linked',
      render: (row: FileVm) => (
        <span className="line-clamp-2 text-lp-text-secondary">{row.linkedSummary}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-[22px] font-bold leading-tight text-lp-text">Tour files</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-lp-text-secondary">Read-only list — tap a row to open.</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or link…"
        className="mt-4 w-full rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-[16px] text-lp-text outline-none"
      />
      {loading ? (
        <p className="mt-8 text-center text-lp-text-secondary">Loading…</p>
      ) : (
        <div className="mt-6">
          <DataTable<FileVm>
            columns={columns}
            rows={filtered}
            density="compact"
            rowKey={(r) => r.id}
            onRowClick={openFile}
            emptyLabel="No files match."
          />
        </div>
      )}
    </div>
  );
}
