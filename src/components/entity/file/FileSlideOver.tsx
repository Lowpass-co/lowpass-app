'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Download, FileQuestion } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import type { FileVm } from '@/lib/tour-files/types';

/** Non-registry pattern: rendered by list pages directly (files are not in the canonical entity routing map). */

function canInlinePreview(vm: FileVm): boolean {
  const m = vm.mimeType?.toLowerCase() ?? '';
  if (!vm.previewUrl && !vm.externalUrl) return false;
  if (m.startsWith('image/')) return true;
  return m.includes('pdf');
}

export default function FileSlideOver({ file, onClose }: { file: FileVm; onClose: () => void }) {
  const href = file.previewUrl ?? file.externalUrl ?? null;

  const download = () => {
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  const headerExtra = (
    <button
      type="button"
      className="rounded-lg border px-3 py-1.5 text-sm"
      style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
      onClick={download}
      disabled={!href}
    >
      <span className="inline-flex items-center gap-2">
        <Download className="h-4 w-4" />
        Download
      </span>
    </button>
  );

  return (
    <SlideOver
      open
      onClose={onClose}
      title={file.filename}
      subtitle={
        <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
          {file.source.replace('-', ' ')} · {file.linkedSummary}
        </span>
      }
      headerActions={headerExtra}
      width="wide"
      backdrop
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md border border-lp-border px-3 py-2 text-sm text-lp-text"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">Preview</h3>
          {!href ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-lp-border px-6 py-10 text-center text-sm text-lp-text-secondary">
              <FileQuestion className="h-10 w-10 text-lp-text-tertiary" />
              <p>No inline preview yet for this provider path.</p>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => download()}
              >
                Download to preview
              </button>
            </div>
          ) : canInlinePreview(file) && file.mimeType?.startsWith('image/') ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-lp-border bg-lp-bg">
              <Image src={href} alt="" fill className="object-contain" unoptimized sizes="100vw" />
            </div>
          ) : canInlinePreview(file) && file.mimeType?.includes('pdf') ? (
            <embed src={href} type="application/pdf" className="h-[70vh] w-full rounded-lg border border-lp-border" />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-lp-border px-6 py-8 text-center text-sm text-lp-text-secondary">
              <p>Preview unavailable for this file type.</p>
              <button type="button" className="rounded-md bg-lp-orange px-3 py-2 text-sm font-medium text-white" onClick={download}>
                Open / download
              </button>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">Metadata</h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Dt label="MIME">{file.mimeType ?? '—'}</Dt>
            <Dt label="Size">{fmtBytes(file.size)}</Dt>
            <Dt label="Uploaded by">{file.uploadedByName ?? '—'}</Dt>
            <Dt label="Uploaded at">{new Date(file.uploadedAt).toLocaleString()}</Dt>
          </dl>
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">Linked records</h3>
          <p className="text-sm text-lp-text-secondary">{file.linkedSummary}</p>
          {file.showId && (
            <p className="text-xs text-lp-text-tertiary">
              Show routing: <span className="font-mono text-lp-text">{file.showId}</span>
            </p>
          )}
          {file.personId && (
            <p className="text-xs text-lp-text-tertiary">
              Person ID: <span className="font-mono text-lp-text">{file.personId}</span>
            </p>
          )}
          {file.riderPackId && (
            <p className="text-xs text-lp-text-tertiary">
              Pack: <span className="font-mono text-lp-text">{file.riderPackId}</span>
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">Activity</h3>
          <p className="text-xs text-lp-text-tertiary">Audit log arrives in a later rollout.</p>
        </section>
      </div>
    </SlideOver>
  );
}

function fmtBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Dt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">{label}</dt>
      <dd className="text-lp-text">{children}</dd>
    </div>
  );
}
