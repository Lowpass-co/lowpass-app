'use client';

/* ============================================================
   LOWPASS — <TourFilesClient> (G1-A #2)

   The Files surface for BOTH the per-tour Operations → Files page and the
   artist-library Files page. Read side = a DataTable over consolidated file rows
   (rider assets + file_references); write side = an Upload button + drag-drop
   that POST /api/files (scope = tour | artist). Empty state is an invitation, not
   bare text. `uploadScope` sets what a new file links to.
   ============================================================ */

import { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { File as FileIcon, Upload, FolderOpen } from 'lucide-react';
import { DataTable } from '@/components/data-table/DataTable';
import type { ColumnDef } from '@/components/data-table/types';
import type { FileVm } from '@/lib/tour-files/types';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageHeader';

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

export interface TourFilesClientProps {
  initial: FileVm[];
  /** What an uploaded file links to. Defaults to tour scope for back-compat. */
  uploadScope?: { type: 'tour' | 'artist'; id: string };
  title?: string;
  subtitle?: string;
}

export function TourFilesClient({ initial, uploadScope, title = 'Files', subtitle }: TourFilesClientProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<FileVm[]>(initial);
  const [selected, setSelected] = useState<FileVm | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const doUpload = useCallback(
    async (files: File[]) => {
      if (!uploadScope || files.length === 0) return;
      setUploading(true);
      for (const file of files) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('linked_to_type', uploadScope.type);
          fd.append('linked_to_id', uploadScope.id);
          const res = await fetch('/api/files', { method: 'POST', body: fd });
          const json = (await res.json().catch(() => null)) as { file?: FileVm; error?: string } | null;
          if (!res.ok || !json?.file) {
            showToast(json?.error ?? `Could not upload ${file.name}`, 'error');
            continue;
          }
          setRows((prev) => [json.file as FileVm, ...prev]); // no-reload optimistic prepend
        } catch {
          showToast(`Could not upload ${file.name}`, 'error');
        }
      }
      setUploading(false);
    },
    [uploadScope, showToast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) void doUpload(files);
    },
    [doUpload],
  );

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
        cell: (_, row) => <span className="lp-mono">{fmtSize(row.size)}</span>,
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
        cell: (value) => <span className="text-lp-text-secondary lp-mono">{rel(String(value))}</span>,
      },
    ],
    [],
  );

  const canUpload = !!uploadScope;

  return (
    <div
      className="mx-auto flex min-h-0 max-w-5xl flex-1 flex-col space-y-6 pb-12"
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={canUpload ? onDrop : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle style={{ fontSize: 28 }}>{title}</PageTitle>
          <p className="mt-1 text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            {subtitle ?? 'Consolidated uploads. Row click opens the file panel (preview when available).'}
          </p>
        </div>
        {canUpload ? (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse, #fff)' }}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void doUpload(files);
                e.target.value = '';
              }}
            />
          </>
        ) : null}
      </div>

      {dragActive && canUpload ? (
        <div
          className="rounded-lg border-2 border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--color-lp-orange)', color: 'var(--color-lp-orange)', background: 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)' }}
        >
          Drop to upload
        </div>
      ) : rows.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border px-6 py-14 text-center"
          style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-panel)' }}
        >
          <FolderOpen size={30} strokeWidth={1.5} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--lp-text)' }}>No files yet</p>
          <p className="max-w-sm text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            {canUpload ? 'Drag files here, or use Upload — contracts, tech packs, riders, anything for this ' + (uploadScope?.type ?? 'tour') + '.' : 'Files uploaded elsewhere show up here.'}
          </p>
          {canUpload ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-transition mt-1 inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium"
              style={{ background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse, #fff)' }}
            >
              <Upload className="h-4 w-4" aria-hidden /> Upload the first file
            </button>
          ) : null}
        </div>
      ) : (
        <DataTable<FileVm>
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          searchPlaceholder="Search files…"
          onRowClick={(row) => setSelected(row)}
          emptyState="No files match those filters yet."
        />
      )}

      {selected && <FileSlideOver file={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SourcePill({ source }: { source: FileVm['source'] }) {
  const colours: Record<FileVm['source'], { fg: string; bg: string; label: string }> = {
    'rider-pack': { fg: 'var(--lp-orange)', bg: '#FF45001a', label: 'Rider-pack' },
    advance: { fg: 'var(--lp-text)', bg: 'var(--lp-surface-muted, #374151)', label: 'Advance' },
    personnel: { fg: 'var(--lp-text-secondary)', bg: 'var(--lp-bg-tertiary)', label: 'Personnel' },
    other: { fg: 'var(--lp-text-secondary)', bg: 'var(--lp-bg-tertiary)', label: 'File' },
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
