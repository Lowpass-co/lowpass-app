/* ============================================
   LOWPASS — Receipt Inbox (budget redesign Phase D + X1.3 fix-up)

   X1.3 fix: previous version POSTed to /api/budget/line-items/
   attachments which doesn't exist as a top-level route — Next.js
   resolved the request through to its 404 page (HTML body), which
   surfaced as "drag-drop returns HTML 404" in Adam's smoke. The
   real flow is two-step:

     1. POST /api/budget/receipts (JSON) → creates a receipt record,
        returns its id + auto-generated receipt_number
     2. POST /api/budget/receipts/upload (multipart) → uploads the
        file under the receipt's storage path, returns the URL
        (which we then PATCH back onto the receipt as
        receipt_file_url so the receipt row knows where its file is)

   B2 — per-receipt scrape is now ON, routed entirely through the
   useReceiptScan seam (same create → signed upload → Claude Vision
   OCR → confirm → transaction/link + metering as the B1 panel; no
   second OCR path). Each receipt prefills an editable confirm row
   from the scrape; on confirm the amount lands as a reconciled
   transaction (never a direct actual_cost write — same invariant as
   B1, in_budget:false). PDFs store-but-don't-scan. Per-receipt
   status (scanning / needs review / linked) makes a 20-file drop
   triageable.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useReceiptScan, isOcrableImage } from '@/components/budget/useReceiptScan';
import type { BudgetLineItem } from '@/types';

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export type InboxReceipt = {
  /** Local ID (`local-${ts}`) until the upload responds with a server id. */
  id: string;
  filename: string;
  sizeBytes: number;
  isImage: boolean;
  status: 'uploading' | 'scanning' | 'needs_review' | 'linking' | 'linked' | 'error';
  /** Set once /api/budget/receipts has created the receipt row. */
  receiptId?: string;
  // B2 — editable confirm fields, prefilled from the OCR scrape.
  vendor: string;
  amount: string;
  date: string;
  /** A soft note when the scan couldn't run (PDF / AI cap) — manual entry still works. */
  scanNote?: string;
  /** Set when confirmed + linked to a line item. */
  linkedLineId?: string;
  linkedLineLabel?: string;
  errorMessage?: string;
};

export type ReceiptInboxProps = {
  tourId: string;
  tourCurrency: string;
  /** Pool of unlinked budget line items the picker will show. */
  lineItems: BudgetLineItem[];
};

function bytesLabel(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function ReceiptInbox({ tourId, tourCurrency, lineItems }: ReceiptInboxProps) {
  const { showToast } = useToast();
  const scan = useReceiptScan(tourId, tourCurrency);
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<InboxReceipt[]>([]);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // B2 — a receipt opened from ⌘K search (?receipt=<id>): loaded via the scoped
  // route + a signed file URL, shown at the top of the inbox.
  const [foundReceipt, setFoundReceipt] = useState<{ id: string; label: string; sub: string; fileUrl: string | null } | null>(null);
  // The inbox is a compact toolbar button + a modal panel now (was a big
  // bottom drop-zone). `open` controls the panel.
  const [open, setOpen] = useState(false);
  const linkedCount = receipts.filter((r) => r.status === 'linked').length;

  // B2 — ⌘K "open receipt": when the URL carries ?receipt=<id>, open the inbox and
  // surface that receipt (loaded through the SCOPED tour route + a signed URL —
  // never a broad query; no raw OCR/PII rendered).
  const receiptParam = searchParams.get('receipt');
  useEffect(() => {
    if (!receiptParam) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/budget/receipts?tour_id=${encodeURIComponent(tourId)}`);
        if (!res.ok) return;
        const rows = ((await res.json()) as { receipts?: Array<Record<string, unknown>> }).receipts ?? [];
        const hit = rows.find((r) => r.id === receiptParam);
        if (!hit || cancelled) return;
        const fileUrl = await scan.signUrl(receiptParam);
        if (cancelled) return;
        const vendor = (hit.vendor as string) || (hit.receipt_number as string) || 'Receipt';
        const amount = hit.cost_tour_currency ? `£${Math.round(Number(hit.cost_tour_currency)).toLocaleString('en-GB')}` : null;
        setFoundReceipt({ id: receiptParam, label: vendor, sub: ['Receipt', hit.date as string, amount].filter(Boolean).join(' · '), fileUrl });
        setOpen(true);
      } catch {
        /* best-effort — a search-open failure just doesn't auto-open */
      }
    })();
    return () => { cancelled = true; };
  }, [receiptParam, tourId, scan]);

  const patch = useCallback(
    (localId: string, next: Partial<InboxReceipt>) =>
      setReceipts((prev) => prev.map((r) => (r.id === localId ? { ...r, ...next } : r))),
    [],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
          showToast(`${file.name}: unsupported file type`, 'error');
          continue;
        }
        if (file.size > MAX_SIZE) {
          showToast(`${file.name}: exceeds 10MB`, 'error');
          continue;
        }
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isImage = isOcrableImage(file);
        setReceipts((prev) => [
          ...prev,
          { id: localId, filename: file.name, sizeBytes: file.size, isImage, status: 'uploading', vendor: '', amount: '', date: '' },
        ]);
        try {
          // 1) Create the receipt row (in_budget:false — the amount lands as a
          //    reconciled transaction on confirm, never a direct actual_cost write).
          const draft = await scan.createReceipt({ in_budget: false });
          patch(localId, { receiptId: draft.id });

          // 2) Upload under the receipt's id-keyed path; store the PATH (re-signed
          //    on read — signed URLs only, no public URL).
          const { path } = await scan.uploadFile(draft.id, file);
          await scan.patchReceipt(draft.id, { receipt_file_url: path });

          // 3) Scrape (images only) — pass the receiptId so the route persists the
          //    extraction for ⌘K search. PDFs skip the scan (store-but-don't-scan).
          patch(localId, { status: 'scanning' });
          const outcome = await scan.ocr(file, draft.id);
          const o = outcome.data;
          const note = outcome.error
            ? outcome.error
            : !isImage
              ? 'PDF stored — scan is image-only; enter the details below.'
              : undefined;
          patch(localId, {
            status: 'needs_review',
            vendor: o?.vendor ?? '',
            amount: o?.total_amount != null ? String(o.total_amount) : '',
            date: o?.date ?? '',
            scanNote: note,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          patch(localId, { status: 'error', errorMessage: msg });
          showToast(msg, 'error');
        }
      }
    },
    [showToast, scan, patch],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files?.length) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  // Confirm a reviewed receipt against a budget line — mirrors the B1 panel's
  // onSave EXACTLY: persist the edited fields, then back the amount with a NEW
  // transaction on the line (sums into actual via reconcile; never a direct
  // actual_cost write — in_budget stayed false). The receipt is associated to the
  // line via linked_line_item_id for the receipt log.
  const confirmWithLine = useCallback(
    async (receiptLocalId: string, line: BudgetLineItem) => {
      const target = receipts.find((r) => r.id === receiptLocalId);
      if (!target?.receiptId) return;
      setPickerForId(null);
      patch(receiptLocalId, { status: 'linking' });
      const amount = Number(target.amount) || 0;
      const vendorName = target.vendor.trim() || 'Receipt';
      try {
        await scan.patchReceipt(target.receiptId, {
          vendor: target.vendor || null,
          date: target.date || null,
          cost_tour_currency: amount,
          cost_home_currency: amount,
          linked_line_item_id: line.id,
        });
        if (amount > 0) {
          await scan.createTransaction(line.id, {
            vendor_name: vendorName,
            amount,
            paid_at: target.date || null,
            receipt_id: target.receiptId,
          });
        }
        patch(receiptLocalId, { status: 'linked', linkedLineId: line.id, linkedLineLabel: line.label });
        showToast(`Linked to ${line.label}${amount > 0 ? ` · ${vendorName}` : ''}`);
      } catch (err) {
        patch(receiptLocalId, { status: 'needs_review', errorMessage: err instanceof Error ? err.message : 'Link failed' });
        showToast(err instanceof Error ? err.message : 'Link failed', 'error');
      }
    },
    [receipts, scan, patch, showToast],
  );

  return (
    <>
      {/* Compact toolbar trigger — opens the inbox panel, and also accepts
          a direct drag-drop of receipt files (uploads + opens the panel). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          onDrop(e);
          setOpen(true);
        }}
        className="btn-transition inline-flex items-center gap-1 rounded-md border px-3 py-1"
        style={{
          borderColor: dragActive ? 'var(--color-lp-orange)' : 'var(--lp-border)',
          background: dragActive
            ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
            : 'var(--lp-bg)',
          color: dragActive ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
          fontSize: '12px',
        }}
        title="Upload + link receipts (or drop files here)"
        aria-label="Receipts"
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden />
        Receipts
        {receipts.length > 0 ? (
          <span
            className="lp-mono rounded-full px-1.5"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              background: 'color-mix(in srgb, var(--color-lp-orange) 16%, transparent)',
              color: 'var(--color-lp-orange)',
            }}
          >
            {receipts.length}
          </span>
        ) : null}
      </button>

      {/* Hidden file input (shared by the trigger + the modal drop zone). */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
        multiple
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Inbox panel (modal) — the drop zone + uploaded list, opened from
          the compact button. */}
      {open ? (
        <div
          className="fixed inset-0 flex items-start justify-center p-4 pt-24"
          style={{ background: 'color-mix(in srgb, #000 40%, transparent)', zIndex: 1090 }}
          onClick={() => setOpen(false)}
        >
          <section
            className="flex w-full max-w-lg flex-col gap-3 rounded-xl border p-4 shadow-lg"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3
                style={{
                  color: 'var(--lp-text-tertiary)',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  letterSpacing: 'var(--lp-tracking-caps)',
                  textTransform: 'uppercase',
                }}
              >
                Receipt inbox
              </h3>
              <div className="flex items-center gap-2">
                {receipts.length > 0 ? (
                  <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                    {receipts.length} uploaded · {linkedCount} linked
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-transition rounded-md p-1"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                  aria-label="Close receipt inbox"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* B2 — receipt opened from ⌘K search */}
            {foundReceipt ? (
              <div
                className="flex items-center gap-3 rounded-md border px-3 py-2"
                style={{ borderColor: 'var(--color-lp-orange)', background: 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)' }}
              >
                <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--color-lp-orange)' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" style={{ color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)' }}>{foundReceipt.label}</div>
                  <div className="truncate text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{foundReceipt.sub} · from search</div>
                </div>
                {foundReceipt.fileUrl ? (
                  <a
                    href={foundReceipt.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    View file
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors"
              style={{
                borderColor: dragActive
                  ? 'var(--color-lp-orange)'
                  : 'var(--lp-border)',
                background: dragActive
                  ? 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)'
                  : 'transparent',
              }}
            >
              <Upload
                className="h-6 w-6"
                style={{ color: 'var(--lp-text-tertiary)' }}
                aria-hidden
              />
              <p
                className="text-sm"
                style={{ color: 'var(--lp-text-secondary)' }}
              >
                Drop receipts here or{' '}
                <span style={{ color: 'var(--color-lp-orange)' }}>click to upload</span>
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--lp-text-tertiary)' }}
              >
                PDF, JPG, PNG · up to 10 MB
              </p>
            </div>

      {/* Uploaded list */}
      {receipts.length > 0 ? (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="rounded-md border px-3 py-2"
              style={{
                borderColor:
                  r.status === 'error'
                    ? 'var(--color-lp-status-needs-review)'
                    : 'var(--lp-border)',
                background: 'var(--lp-bg-secondary)',
              }}
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" style={{ color: 'var(--lp-text)' }}>{r.filename}</div>
                  <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                    {bytesLabel(r.sizeBytes)}
                    {r.status === 'linked' && r.linkedLineLabel ? ` · linked to ${r.linkedLineLabel}` : ''}
                    {r.status === 'error' && r.errorMessage ? ` · ${r.errorMessage}` : ''}
                  </div>
                </div>
                {/* status chip */}
                {r.status === 'uploading' || r.status === 'scanning' || r.status === 'linking' ? (
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {r.status === 'uploading' ? 'Uploading' : r.status === 'scanning' ? 'Scanning…' : 'Linking…'}
                  </span>
                ) : r.status === 'needs_review' ? (
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ color: 'var(--color-lp-status-needs-review)', background: 'color-mix(in srgb, var(--color-lp-status-needs-review) 12%, transparent)', fontWeight: 'var(--lp-weight-medium)' }}>
                    Needs review
                  </span>
                ) : r.status === 'linked' ? (
                  <span className="text-xs" style={{ color: 'var(--color-lp-status-complete)', fontWeight: 'var(--lp-weight-medium)' }}>✓ Linked</span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--color-lp-status-needs-review)' }}>Failed</span>
                )}
              </div>

              {/* needs_review → editable confirm row (prefilled from the scrape) */}
              {r.status === 'needs_review' ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.scanNote ? (
                    <div className="w-full text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>{r.scanNote}</div>
                  ) : null}
                  <input
                    value={r.vendor}
                    onChange={(e) => patch(r.id, { vendor: e.target.value })}
                    placeholder="Vendor"
                    className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)', color: 'var(--lp-text)' }}
                  />
                  <input
                    value={r.amount}
                    onChange={(e) => patch(r.id, { amount: e.target.value })}
                    placeholder="Amount"
                    inputMode="decimal"
                    className="w-24 rounded-md border px-2 py-1 text-right text-sm tabular-nums"
                    style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)', color: 'var(--lp-text)' }}
                  />
                  <input
                    value={r.date}
                    onChange={(e) => patch(r.id, { date: e.target.value })}
                    type="date"
                    className="rounded-md border px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-bg)', color: 'var(--lp-text)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setPickerForId(r.id)}
                    className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    style={{ borderColor: 'var(--color-lp-orange)', color: 'var(--color-lp-orange)', background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)', fontWeight: 'var(--lp-weight-medium)' }}
                  >
                    <Paperclip className="h-3 w-3" aria-hidden />
                    Link &amp; confirm
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
          </section>
        </div>
      ) : null}

      {/* Inline line-item picker overlay (lightweight, not a SlideOver
          since the inbox stays on-page).  */}
      {pickerForId !== null ? (
        <div
          className="fixed inset-0 z-[var(--lp-z-modal-backdrop)] flex items-center justify-center p-4"
          style={{
            background:
              'color-mix(in srgb, #000 40%, transparent)',
            zIndex: 1100,
          }}
          onClick={() => setPickerForId(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border shadow-lg"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              maxHeight: '70vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <h4
                style={{
                  color: 'var(--lp-text)',
                  fontSize: 'var(--lp-text-base)',
                  fontWeight: 'var(--lp-weight-semibold)',
                }}
              >
                Link to budget line
              </h4>
              <button
                type="button"
                onClick={() => setPickerForId(null)}
                className="btn-transition rounded-md p-1"
                style={{ color: 'var(--lp-text-tertiary)' }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul
              className="overflow-y-auto p-2"
              style={{ maxHeight: 'calc(70vh - 56px)' }}
            >
              {lineItems.length === 0 ? (
                <li
                  className="px-3 py-4 text-center text-sm"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  No budget line items on this tour yet.
                </li>
              ) : (
                lineItems.map((line) => (
                  <li key={line.id}>
                    <button
                      type="button"
                      onClick={() => void confirmWithLine(pickerForId, line)}
                      className="btn-transition flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm"
                      style={{ color: 'var(--lp-text)' }}
                    >
                      <div className="min-w-0">
                        <div className="truncate">
                          {line.label || '(untitled)'}
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: 'var(--lp-text-tertiary)' }}
                        >
                          {(line.category ?? '—').toString()}
                        </div>
                      </div>
                      <span
                        className="shrink-0 tabular-nums text-xs"
                        style={{ color: 'var(--lp-text-secondary)' }}
                      >
                        {Number(line.proposed_cost ?? 0).toLocaleString(
                          'en-GB',
                          {
                            style: 'currency',
                            currency: (line.currency ?? 'GBP').toUpperCase(),
                            maximumFractionDigits: 0,
                          },
                        )}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
