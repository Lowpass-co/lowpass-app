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

   Linking a receipt to a budget_line_item happens via PATCH on
   /api/budget/receipts with linked_line_item_id; the existing
   route already handles the side effect of bumping the line item's
   actual_cost when in_budget toggles.

   OCR auto-extract is deferred. /api/budget/receipts/ocr exists
   (Claude Vision) but requires ANTHROPIC_API_KEY provisioning;
   flipping it on now would surface "billing required" toasts in
   environments without the key. Follow-up sprint.
   ============================================ */

'use client';

import { useCallback, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { BudgetLineItem } from '@/types';

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export type InboxReceipt = {
  /** Local ID (`local-${ts}`) until the upload responds with a server id. */
  id: string;
  filename: string;
  sizeBytes: number;
  status: 'uploading' | 'unlinked' | 'linked' | 'error';
  /** Set once /api/budget/receipts has created the receipt row. */
  receiptId?: string;
  /** Set when linked to a line item. */
  linkedLineId?: string;
  linkedLineLabel?: string;
  errorMessage?: string;
};

export type ReceiptInboxProps = {
  tourId: string;
  /** Pool of unlinked budget line items the picker will show. */
  lineItems: BudgetLineItem[];
};

function bytesLabel(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function ReceiptInbox({ tourId, lineItems }: ReceiptInboxProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<InboxReceipt[]>([]);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
        setReceipts((prev) => [
          ...prev,
          {
            id: localId,
            filename: file.name,
            sizeBytes: file.size,
            status: 'uploading',
          },
        ]);
        try {
          // 1) Create the receipt row.
          const createRes = await fetch('/api/budget/receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tour_id: tourId,
              vendor: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
              description: 'Uploaded receipt',
            }),
          });
          if (!createRes.ok) {
            const text = await createRes.text();
            throw new Error(text || 'Receipt create failed');
          }
          const createdJson = (await createRes.json()) as { id?: string; receipt?: { id?: string } };
          const receiptId = createdJson.id ?? createdJson.receipt?.id;
          if (!receiptId) throw new Error('Receipt create returned no id');

          // 2) Upload the file under the receipt's storage path.
          const fd = new FormData();
          fd.set('file', file);
          fd.set('tour_id', tourId);
          fd.set('receipt_id', receiptId);
          const uploadRes = await fetch('/api/budget/receipts/upload', {
            method: 'POST',
            body: fd,
          });
          if (!uploadRes.ok) {
            const text = await uploadRes.text();
            throw new Error(text || 'Upload failed');
          }
          const uploadJson = (await uploadRes.json()) as { url?: string };

          // 3) PATCH the receipt with the file URL so the row knows
          //    where its file lives. Failure here is non-fatal — the
          //    file is uploaded; we just lose the convenience link.
          if (uploadJson.url) {
            await fetch('/api/budget/receipts', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: receiptId,
                receipt_file_url: uploadJson.url,
              }),
            }).catch(() => undefined);
          }

          setReceipts((prev) =>
            prev.map((r) =>
              r.id === localId
                ? {
                    ...r,
                    status: 'unlinked',
                    receiptId,
                  }
                : r,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setReceipts((prev) =>
            prev.map((r) =>
              r.id === localId
                ? { ...r, status: 'error', errorMessage: msg }
                : r,
            ),
          );
          showToast(msg, 'error');
        }
      }
    },
    [showToast, tourId],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files?.length) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const linkTo = useCallback(
    async (receiptLocalId: string, line: BudgetLineItem) => {
      const target = receipts.find((r) => r.id === receiptLocalId);
      if (!target?.receiptId) return;
      try {
        const res = await fetch('/api/budget/receipts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: target.receiptId,
            linked_line_item_id: line.id,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        setReceipts((prev) =>
          prev.map((r) =>
            r.id === receiptLocalId
              ? {
                  ...r,
                  status: 'linked',
                  linkedLineId: line.id,
                  linkedLineLabel: line.label,
                }
              : r,
          ),
        );
        showToast(`Linked to ${line.label}`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Link failed',
          'error',
        );
      } finally {
        setPickerForId(null);
      }
    },
    [receipts, showToast],
  );

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
      }}
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
        {receipts.length > 0 ? (
          <span
            className="text-xs"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            {receipts.length} uploaded · {receipts.filter((r) => r.status === 'linked').length} linked
          </span>
        ) : null}
      </div>

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
      </div>

      {/* Uploaded list */}
      {receipts.length > 0 ? (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
              style={{
                borderColor:
                  r.status === 'error'
                    ? 'var(--color-lp-status-needs-review)'
                    : 'var(--lp-border)',
                background: 'var(--lp-bg-secondary)',
              }}
            >
              <FileText
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--lp-text-tertiary)' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-sm"
                  style={{ color: 'var(--lp-text)' }}
                >
                  {r.filename}
                </div>
                <div
                  className="text-xs"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                >
                  {bytesLabel(r.sizeBytes)}
                  {r.status === 'linked' && r.linkedLineLabel
                    ? ` · linked to ${r.linkedLineLabel}`
                    : ''}
                  {r.status === 'error' && r.errorMessage
                    ? ` · ${r.errorMessage}`
                    : ''}
                </div>
              </div>
              {r.status === 'uploading' ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  style={{ color: 'var(--lp-text-tertiary)' }}
                  aria-label="Uploading"
                />
              ) : r.status === 'unlinked' ? (
                <button
                  type="button"
                  onClick={() => setPickerForId(r.id)}
                  className="btn-transition inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                  style={{
                    borderColor: 'var(--color-lp-orange)',
                    color: 'var(--color-lp-orange)',
                    background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
                    fontWeight: 'var(--lp-weight-medium)',
                  }}
                >
                  <Paperclip className="h-3 w-3" aria-hidden />
                  Link to item
                </button>
              ) : r.status === 'linked' ? (
                <span
                  className="text-xs"
                  style={{
                    color: 'var(--color-lp-status-complete)',
                    fontWeight: 'var(--lp-weight-medium)',
                  }}
                >
                  ✓ Linked
                </span>
              ) : (
                <span
                  className="text-xs"
                  style={{ color: 'var(--color-lp-status-needs-review)' }}
                >
                  Failed
                </span>
              )}
            </li>
          ))}
        </ul>
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
                      onClick={() => linkTo(pickerForId, line)}
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
    </section>
  );
}
