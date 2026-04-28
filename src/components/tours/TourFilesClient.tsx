'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { File as FileIcon } from 'lucide-react';
import { DataTable } from '@/components/entity/DataTable';
import type { FileVm } from '@/lib/tour-files/types';

const FileSlideOver = dynamic(() => import('@/components/entity/file/FileSlideOver'), { ssr: false });

function fmtSize(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function rel(iso: string): string {
  try {
    const d = new Date(iso);
    const delta = Date.now() - d.getTime();
    const mins = Math.floor(delta / 60000);
    if (mins < 120) return `${mins}m ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function TourFilesClient({ initial }: { initial: FileVm[] }) {
  const [selected, setSelected] = useState<FileVm | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | FileVm['source']>('all');
  const [linkedFilter, setLinkedFilter] = useState<'all' | 'rider' | 'tour_ref' | 'show_or_routing'>('all');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const filtered = useMemo(() => {
    let rows = initial;
    if (sourceFilter !== 'all') rows = rows.filter((r) => r.source === sourceFilter);
    if (linkedFilter === 'rider') rows = rows.filter((r) => r.source === 'rider-pack');
    if (linkedFilter === 'tour_ref')
      rows = rows.filter((r) => r.id.startsWith('ref:') && r.linkedSummary.toLowerCase().includes('tour'));
    if (linkedFilter === 'show_or_routing')
      rows = rows.filter((r) => r.showId || r.linkedSummary.includes('routing'));
    if (rangeStart)
      rows = rows.filter((r) => new Date(r.uploadedAt).getTime() >= new Date(rangeStart).getTime());
    if (rangeEnd) rows = rows.filter((r) => new Date(r.uploadedAt).getTime() <= new Date(rangeEnd).getTime() + 86400000);
    return rows;
  }, [initial, sourceFilter, linkedFilter, rangeStart, rangeEnd]);

  const columns = useMemo(
    () => [
      {
        key: 'fn',
        header: 'Filename',
        render: (row: FileVm) => (
          <span className="flex items-center gap-2 font-medium">
            <FileIcon className="h-4 w-4 shrink-0 text-lp-text-tertiary" />
            <span>{row.filename}</span>
          </span>
        ),
      },
      {
        key: 'source',
        header: 'Source',
        render: (row: FileVm) => <SourcePill source={row.source} />,
      },
      {
        key: 'linked',
        header: 'Linked to',
        render: (row: FileVm) => <span className="text-lp-text-secondary">{row.linkedSummary}</span>,
      },
      {
        key: 'sz',
        header: 'Size',
        render: (row: FileVm) => <span>{fmtSize(row.size)}</span>,
      },
      {
        key: 'by',
        header: 'Uploaded by',
        render: (row: FileVm) => row.uploadedByName ?? '—',
      },
      {
        key: 'at',
        header: 'Uploaded',
        className: 'whitespace-nowrap text-lp-text-secondary',
        render: (row: FileVm) => rel(row.uploadedAt),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex min-h-0 max-w-5xl flex-1 flex-col space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--lp-text)' }}>
          Files
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
          Consolidated uploads for this tour. Row click opens the file panel (preview when available).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-lp-border pb-4">
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          Source
          <select
            className="min-w-[8rem] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs text-lp-text"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
          >
            <option value="all">All</option>
            <option value="rider-pack">Rider-pack</option>
            <option value="advance">Advance</option>
            <option value="personnel">Personnel</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          Linked scope
          <select
            className="min-w-[11rem] rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs text-lp-text"
            value={linkedFilter}
            onChange={(e) => setLinkedFilter(e.target.value as typeof linkedFilter)}
          >
            <option value="all">All</option>
            <option value="rider">Rider assets</option>
            <option value="tour_ref">Tour-linked refs</option>
            <option value="show_or_routing">Show / routing</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          From
          <input type="date" className={PICK} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          To
          <input type="date" className={PICK} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
        </label>
      </div>

      <DataTable<FileVm>
        columns={columns}
        rows={filtered}
        emptyLabel="No files for these filters yet."
        onRowClick={(row) => setSelected(row)}
      />

      <p className="text-[11px] text-lp-text-tertiary">
        Non-registry slide-over:{' '}
        <code className="rounded bg-lp-bg-tertiary px-1">FileSlideOver</code> is rendered by this page locally (same pattern
        other tour-scoped file hubs can reuse).
      </p>

      {selected && (
        <FileSlideOver file={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

const PICK = 'rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs text-lp-text outline-none';

function SourcePill({ source }: { source: FileVm['source'] }) {
  const colours: Record<FileVm['source'], { fg: string; bg: string; label: string }> = {
    'rider-pack': { fg: 'var(--lp-orange)', bg: '#FF45001a', label: 'Rider-pack' },
    advance: { fg: 'var(--lp-text)', bg: 'var(--lp-surface-muted, #374151)', label: 'Advance' },
    personnel: { fg: 'var(--lp-text-secondary)', bg: 'var(--lp-bg-tertiary)', label: 'Personnel' },
    other: { fg: 'var(--lp-text-secondary)', bg: 'var(--lp-bg-tertiary)', label: 'Other' },
  };
  const c = colours[source];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: c.fg, backgroundColor: c.bg }}
    >
      {c.label}
    </span>
  );
}
