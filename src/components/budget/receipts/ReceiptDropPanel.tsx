/* ============================================
   LOWPASS — receipt drop (RC-1; budget page redraw, Nov 2026)

   Nov 2026 (Adam): the drop box sat BELOW the whole grid, and a file dropped
   anywhere else on the page was swallowed. Now three pieces share one queue:

     <ReceiptDropProvider>  owns the queue + the window drop listener: a file
                            dropped ANYWHERE on the budget is taken, unless
                            something under it (a grid row) already took it
                            (`defaultPrevented`) — so row drops still attach
                            to that row and never upload twice.
     <AddReceiptsButton>    the title-line button (click = browse, drop = add).
     <ReceiptDropActivity>  progress + proposals, under the title — only while
                            there is something to show.

   <ReceiptDropPanel> is the three together (tests, and any page that wants
   the old single block).

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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileWarning, Check, Loader2, ScanLine, ChevronRight } from 'lucide-react';
import './receiptDrop.css';
import { useReceiptDropQueue, BATCH_OCR_CAP, type DropItem } from './useReceiptDropQueue';
import {
  ReceiptProposalQueue,
  type QueueLineOption,
  type QueueProposal,
} from './ReceiptProposalQueue';

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

interface DropCtx {
  tourId: string;
  items: DropItem[];
  counts: ReturnType<typeof useReceiptDropQueue>['counts'];
  busy: boolean;
  dragging: boolean;
  addFiles: (files: File[]) => void;
  clear: () => void;
  browse: () => void;
  scanned: DropItem[];
  readyToPropose: boolean;
  proposing: boolean;
  propose: () => Promise<void>;
  batchId: string | null;
  proposals: QueueProposal[];
  lineItems: QueueLineOption[];
  previewByReceiptId: Record<string, string>;
  finish: () => void;
}

const Ctx = createContext<DropCtx | null>(null);
function useDrop(): DropCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('Receipt drop pieces must sit inside <ReceiptDropProvider>');
  return c;
}

const hasFiles = (e: { dataTransfer: DataTransfer | null }) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function ReceiptDropProvider({
  tourId,
  tourCurrency,
  lineItems = [],
  children,
}: {
  tourId: string;
  tourCurrency: string;
  /** Budget lines the proposal queue offers as link targets. */
  lineItems?: QueueLineOption[];
  children: ReactNode;
}) {
  const { items, counts, busy, addFiles: enqueue, clear } = useReceiptDropQueue(tourId, tourCurrency);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /* RC-3 — once a drop finishes scanning, stage PROPOSALS. Still writes no
     money: the proposals route only stages rows for review. */
  const [batchId, setBatchId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<QueueProposal[]>([]);
  const [proposing, setProposing] = useState(false);

  const scanned = items.filter((i) => i.status === 'proposed' && i.receiptId && i.ocr);
  const readyToPropose = !busy && scanned.length > 0 && batchId === null;

  const previewByReceiptId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of items) if (i.receiptId && i.previewUrl) m[i.receiptId] = i.previewUrl;
    return m;
  }, [items]);

  const addFiles = useCallback((files: File[]) => {
    if (files.length) void enqueue(files);
  }, [enqueue]);

  const propose = useCallback(async () => {
    setProposing(true);
    try {
      const res = await fetch('/api/budget/receipts/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId,
          receipts: scanned.map((i) => ({ receiptId: i.receiptId, ocr: i.ocr })),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { batchId?: string; proposals?: QueueProposal[] };
      if (res.ok && j.batchId) {
        setBatchId(j.batchId);
        setProposals(j.proposals ?? []);
      }
    } finally {
      setProposing(false);
    }
  }, [tourId, scanned]);

  const finish = useCallback(() => {
    // The grid reads server state; a refresh shows the moved actuals.
    setBatchId(null);
    setProposals([]);
    clear();
    router.refresh();
  }, [clear, router]);

  /* Page-level drag. dragenter/leave fire per element, so count depth rather
     than toggling, or crossing a child flickers the hint off. A drop that
     nothing below took (not defaultPrevented) is a receipt drop. */
  const depth = useRef(0);
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
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
      depth.current = 0;
      setDragging(false);
      if (e.defaultPrevented) return; // a grid row (or the button) already took it
      e.preventDefault(); // never let the browser navigate to the file
      addRef.current(Array.from(e.dataTransfer?.files ?? []));
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

  const value: DropCtx = {
    tourId, items, counts, busy, dragging, addFiles, clear,
    browse: () => inputRef.current?.click(),
    scanned, readyToPropose, proposing, propose, batchId, proposals, lineItems,
    previewByReceiptId, finish,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        aria-label="Choose receipt files"
        style={{ display: 'none' }}
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // let the same file be re-picked
        }}
      />
      {/* The hint never blocks: pointer-events off, so a drop still lands on
          the row under it (attach there) or on the page (new receipt). */}
      {dragging ? (
        <div className="rd-hint" role="status" data-testid="receipt-drop-hint">
          <Upload className="h-4 w-4" aria-hidden />
          Drop to add receipts — or onto a line to attach it there
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

/** "Add receipts" — the page's one orange button. Click = browse; a drop on it
 *  is taken here (the window listener sees defaultPrevented and skips it). */
export function AddReceiptsButton() {
  const d = useDrop();
  return (
    <button
      type="button"
      data-testid="receipt-drop-zone"
      className={`rd-add${d.dragging ? ' is-dragging' : ''}`}
      onClick={d.browse}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        d.addFiles(Array.from(e.dataTransfer?.files ?? []));
      }}
      title="Photos or PDFs — we read them and propose lines. Nothing is added to the budget without your approval."
    >
      <Upload className="h-4 w-4" aria-hidden />
      Add receipts
    </button>
  );
}

/** The Receipts page's drop bar (Nov 2026, Adam: "should have a receipt drop
 *  bar here too!"). A wide target to drop onto or click; the whole page still
 *  takes a drop (the provider's window listener). On the Budget sheet the
 *  title-line button is enough — never add this under the grid. */
export function ReceiptDropBar() {
  const d = useDrop();
  return (
    <button
      type="button"
      data-testid="receipt-drop-bar"
      className={`rd-bar${d.dragging ? ' is-dragging' : ''}`}
      onClick={d.browse}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        d.addFiles(Array.from(e.dataTransfer?.files ?? []));
      }}
    >
      <Upload className="h-4 w-4" aria-hidden />
      <span>
        <strong>Drop receipts here</strong> or click to choose — photos or PDFs, as many as you like
      </span>
    </button>
  );
}

/** "N need details" beside the button — the way to the receipts bank. */
export function ReceiptsNeedDetailsLink({ tourId, count }: { tourId: string; count: number }) {
  return (
    <a data-testid="receipt-bank-link" className="rd-need" href={`/budget/${tourId}?tab=receipts`}>
      {count > 0 ? `${count} receipt${count === 1 ? '' : 's'} need details` : 'All receipts'}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

/** Progress + proposals, under the title. Nothing renders while idle. */
export function ReceiptDropActivity() {
  const d = useDrop();
  const { counts, items } = d;
  if (items.length === 0 && !d.batchId) return null;
  return (
    <section aria-label="Receipts" className="rd-panel">
      <header className="rd-panel-head">
        <span className="rd-label">Adding receipts</span>
        {counts.total > 0 ? (
          <span className="rd-counts">
            {counts.saved}/{counts.total} saved
            {counts.proposed ? ` · ${counts.proposed} read` : ''}
            {counts.manual ? ` · ${counts.manual} need details` : ''}
            {counts.failed ? ` · ${counts.failed} failed` : ''}
          </span>
        ) : null}
        {counts.total > 0 && !d.busy ? (
          <button type="button" className="rd-clear" onClick={d.clear}>Clear list</button>
        ) : null}
      </header>

      {items.length > 0 ? (
        <ul aria-live="polite" className="rd-list">
          {items.map((it) => (
            <li key={it.key} data-testid="receipt-drop-item" className="rd-item">
              {it.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.previewUrl} alt="" className="rd-thumb" />
              ) : (
                <span aria-hidden className="rd-thumb rd-thumb-empty">
                  <ScanLine className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="rd-name">
                <span className="truncate">
                  {it.receiptNumber ? `${it.receiptNumber} · ` : ''}
                  {it.fileName}
                </span>
                {it.note ? <span className="rd-note">{it.note}</span> : null}
              </span>
              <span className="rd-status">
                <StatusIcon status={it.status} />
                {STATUS_LABEL[it.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {d.readyToPropose ? (
        <button
          type="button"
          data-testid="receipt-propose"
          onClick={() => void d.propose()}
          disabled={d.proposing}
          className="rd-propose"
        >
          {d.proposing ? 'Reading the budget…' : `Propose ${d.scanned.length} receipt${d.scanned.length === 1 ? '' : 's'}`}
        </button>
      ) : null}

      {d.batchId ? (
        <ReceiptProposalQueue
          batchId={d.batchId}
          proposals={d.proposals}
          lines={d.lineItems}
          previewByReceiptId={d.previewByReceiptId}
          onApplied={d.finish}
        />
      ) : null}

      <p className="rd-foot">
        Receipts are saved before they&apos;re read, so a failed scan never loses one. Up to{' '}
        {BATCH_OCR_CAP} per drop are scanned automatically.
      </p>
    </section>
  );
}

/** The budget page's wrapper: the provider while the budget tab shows a sheet,
 *  plain children otherwise (no window drop listener on other tabs). */
export function BudgetReceiptDrop({
  enabled,
  children,
  ...props
}: {
  enabled: boolean;
  tourId: string;
  tourCurrency: string;
  lineItems?: QueueLineOption[];
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return <ReceiptDropProvider {...props}>{children}</ReceiptDropProvider>;
}

/** The three together — the old single block. */
export function ReceiptDropPanel(props: {
  tourId: string;
  tourCurrency: string;
  lineItems?: QueueLineOption[];
}) {
  return (
    <ReceiptDropProvider {...props}>
      <div className="flex flex-wrap items-center gap-2">
        <ReceiptsNeedDetailsLink tourId={props.tourId} count={0} />
        <AddReceiptsButton />
      </div>
      <ReceiptDropActivity />
    </ReceiptDropProvider>
  );
}
