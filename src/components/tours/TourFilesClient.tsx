'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { File as FileIcon } from 'lucide-react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
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

  const columns = useMemo<ColumnDef<FileVm>[]>(
    () => [
      {
        id: 'filename',
        header: 'Filename',
        accessor: 'filename',
        sortable: true,
        frozen: true,
        cell: (_, row) => (
          <span className="flex items-center gap-2 font-medium">
            <FileIcon className="h-4 w-4 shrink-0 text-lp-text-tertiary" />
            <span>{row.filename}</span>
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessor: (row) => row.mimeType ?? row.source,
        sortable: true,
        filter: {
          kind: 'select',
          options: [
            { value: 'advance', label: 'advance' },
            { value: 'personnel', label: 'personnel' },
            { value: 'rider-pack', label: 'rider-pack' },
            { value: 'other', label: 'other' },
          ],
        },
        cell: (_, row) => <SourcePill source={row.source} />,
      },
      {
        id: 'tag',
        header: 'Tag',
        accessor: (row) => row.linkedSummary,
        filter: { kind: 'text' },
        cell: (value) => <span className="text-lp-text-secondary">{String(value || '—')}</span>,
      },
      {
        id: 'size',
        header: 'Size',
        accessor: (row) => row.size ?? 0,
        sortable: true,
        align: 'right',
        cell: (_, row) => <span>{fmtSize(row.size)}</span>,
      },
      {
        id: 'uploaded_by',
        header: 'Uploaded by',
        accessor: (row) => row.uploadedByName ?? '',
        filter: { kind: 'text' },
        cell: (value) => String(value || '—'),
      },
      {
        id: 'uploaded_at',
        header: 'Uploaded',
        accessor: (row) => row.uploadedAt,
        sortable: true,
        filter: { kind: 'dateRange' },
        className: 'whitespace-nowrap',
        cell: (value) => <span className="text-lp-text-secondary">{rel(String(value))}</span>,
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
      <DataTable<FileVm>
        rows={initial}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="Search files…"
        onRowClick={(row) => setSelected(row)}
        emptyState="No files for these filters yet."
      />

      {selected && (
        <FileSlideOver file={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

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
