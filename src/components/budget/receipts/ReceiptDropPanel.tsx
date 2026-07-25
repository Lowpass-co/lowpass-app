/* ============================================
   LOWPASS — <ReceiptDropPanel> (RC-1)

   Adam: "make it obvious so you can open it and drag in your receipts and it
   will save". So: a PERSISTENT drop target on the Expenses view, not a hidden
   button — plus a page-level drag listener, so dragging a file anywhere over the
   budget lights this zone up. You should never have to aim.

   RC-1 ends at "saved + scanned". The proposal cards, the link-vs-create
   decision and the approve path are RC-2/RC-3; this panel deliberately writes
   NO money. The per-file states it shows (queued → saving → reading → proposed)
   are exactly the pipeline in useReceiptDropQueue, and "proposed" here means
   "scanned, ready to propose" — the queue that follows lands next stage.

   Accessibility: the drop zone is a real <button> for the click-to-browse path,
   the file input is labelled, and the progress list is an aria-live region so a
   screen-reader user hears files land.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileWarning, Check, Loader2, ScanLine } from 'lucide-react';
import { useReceiptDropQueue, BATCH_OCR_CAP, type DropItem } from './useReceiptDropQueue';

const STATUS_LABEL: Record<DropItem['status'], string> = {
  queued: 'Queued',
  saving: 'Saving…',
  reading: 'Reading…',
  proposed: 'Read',
  needs_manual: 'Needs details',
  failed: 'Failed',
};

function StatusIcon({ status }: { status: DropItem['status'] }) {
  if (status === 'saving' || status === 'reading' || status === 'queued') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--lp-text-tertiary)' }} />;
  }
  if (status === 'proposed') {
    return <Check className="h-3.5 w-3.5" style={{ color: 'var(--color-lp-status-complete)' }} />;
  }
  return <FileWarning className="h-3.5 w-3.5" style={{ color: 'var(--color-lp-warning)' }} />;
}

export function ReceiptDropPanel({
  tourId,
  tourCurrency,
}: {
  tourId: string;
  tourCurrency: string;
}) {
  const { items, counts, busy, addFiles, clear } = useReceiptDropQueue(tourId, tourCurrency);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Page-level drag awareness — dragging a file ANYWHERE over the budget lights
     the zone. dragenter/leave fire per-element, so count depth rather than
     toggling, otherwise crossing a child element flickers the highlight off. */
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // required for drop to fire at all
    };
    const onDropAnywhere = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Outside the zone: swallow it so the browser doesn't navigate to the file.
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDropAnywhere);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDropAnywhere);
    };
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void addFiles(files);
    },
    [addFiles],
  );

  return (
    <section
      aria-label="Receipts"
      style={{
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-lg)',
        background: 'var(--lp-surface)',
        padding: 'var(--lp-space-4)',
      }}
    >
      <header className="flex flex-wrap items-baseline" style={{ gap: 10, marginBottom: 'var(--lp-space-3)' }}>
        <h2 className="lp-label-caps" style={{ margin: 0, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
          Receipts
        </h2>
        {counts.total > 0 ? (
          <span className="lp-mono" style={{ fontSize: '12.5px', color: 'var(--lp-text-secondary)' }}>
            {counts.saved}/{counts.total} saved
            {counts.proposed ? ` · ${counts.proposed} read` : ''}
            {counts.manual ? ` · ${counts.manual} need details` : ''}
            {counts.failed ? ` · ${counts.failed} failed` : ''}
          </span>
        ) : null}
        {counts.total > 0 && !busy ? (
          <button
            type="button"
            onClick={clear}
            style={{
              marginLeft: 'auto',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Clear list
          </button>
        ) : null}
      </header>

      {/* The drop target. A real button so keyboard + click-to-browse work. */}
      <button
        type="button"
        data-testid="receipt-drop-zone"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="btn-transition w-full"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: 'var(--lp-space-6) var(--lp-space-4)',
          borderRadius: 'var(--lp-radius-lg)',
          border: `2px dashed ${dragging ? 'var(--lp-orange)' : 'var(--lp-border-strong)'}`,
          background: dragging ? 'color-mix(in srgb, var(--lp-orange) 6%, transparent)' : 'var(--lp-panel)',
          cursor: 'pointer',
          textAlign: 'center',
        }}
      >
        <Upload className="h-5 w-5" style={{ color: dragging ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)' }} />
        <span style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
          Drop receipts here — photos or PDFs — we&apos;ll read them and propose lines
        </span>
        <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
          or click to browse · nothing is added to the budget without your approval
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        aria-label="Choose receipt files"
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void addFiles(files);
          e.target.value = ''; // let the same file be re-picked
        }}
      />

      {items.length > 0 ? (
        <ul
          aria-live="polite"
          style={{ listStyle: 'none', margin: 'var(--lp-space-3) 0 0', padding: 0, display: 'grid', gap: 6 }}
        >
          {items.map((it) => (
            <li
              key={it.key}
              data-testid="receipt-drop-item"
              style={{
                display: 'grid',
                gridTemplateColumns: '34px minmax(0,1fr) auto',
                alignItems: 'center',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 'var(--lp-radius-md)',
                background: 'var(--lp-panel)',
              }}
            >
              {it.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.previewUrl}
                  alt=""
                  style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 'var(--lp-radius-sm)' }}
                />
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: 34,
                    height: 34,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 'var(--lp-radius-sm)',
                    background: 'var(--lp-surface)',
                  }}
                >
                  <ScanLine className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
                </span>
              )}
              <span style={{ minWidth: 0 }}>
                <span
                  className="truncate"
                  style={{ display: 'block', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}
                >
                  {it.receiptNumber ? `${it.receiptNumber} · ` : ''}
                  {it.fileName}
                </span>
                {it.note ? (
                  <span style={{ display: 'block', fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                    {it.note}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center" style={{ gap: 6, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                <StatusIcon status={it.status} />
                {STATUS_LABEL[it.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p style={{ marginTop: 'var(--lp-space-2)', fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
        Receipts are saved before they&apos;re read, so a failed scan never loses one. Up to{' '}
        {BATCH_OCR_CAP} per drop are scanned automatically.
      </p>
    </section>
  );
}
