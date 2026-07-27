'use client';

/* ============================================
   LOWPASS — <AddReceiptPanel> (Receipts overhaul B1)

   The real desktop Add-Receipt flow, replacing the empty-numbered-pill mint:
     drag-drop OR file-pick → create the expense_receipts row → signed upload →
     (image only) Claude Vision OCR → prefill an EDITABLE confirm form → on
     confirm, PATCH the fields + receipt_file_url + back the amount with a
     transaction (line) or link it to the existing transaction → thumbnail +
     lightbox.

   D-SCRAPE: the scrape is a suggestion; nothing touches actual_cost directly —
   the amount lands as a transaction (reconciled). PDF = store, don't scan.
   All API work goes through the shared useReceiptScan seam.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import {
  useReceiptScan,
  isScannable,
  receiptChipLabel,
  type ReceiptRow,
} from '@/components/budget/useReceiptScan';

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };

export interface AddReceiptResult {
  receiptId: string;
  label: string;
  amount: number;
}

interface FormState {
  vendor: string;
  date: string;
  amount: string;
  currency: string;
  category: string;
  description: string;
}

type Phase = 'pick' | 'scanning' | 'review' | 'saving';

export function AddReceiptPanel({
  tourId,
  tourCurrency,
  lineId,
  txnId,
  initialFile,
  onClose,
}: {
  tourId: string;
  tourCurrency: string;
  lineId: string;
  txnId?: string;
  /** Receipts B1.5 — a file already in hand (dragged onto the grid row). When set,
   *  the panel skips the pick step and auto-starts the scrape pipeline on mount. */
  initialFile?: File | null;
  onClose: (result: AddReceiptResult | null) => void;
}) {
  const scan = useReceiptScan(tourId, tourCurrency);
  const native = (tourCurrency || 'GBP').toUpperCase();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('pick');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptRow | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [form, setForm] = useState<FormState>({
    vendor: '', date: '', amount: '', currency: native, category: '', description: '',
  });

  // ── drop / pick → create draft row → upload → OCR → prefill ──
  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setScanNote(null);
      setPhase('scanning');
      setIsPdf(file.type === 'application/pdf');
      try {
        // OCR (image only) in parallel with creating the draft row.
        const [ocrOutcome, draft] = await Promise.all([
          scan.ocr(file),
          scan.createReceipt({ linked_line_item_id: lineId, in_budget: false }),
        ]);
        // Upload to the draft's id-keyed path; store the PATH (re-signed on read).
        const { path, url } = await scan.uploadFile(draft.id, file);
        await scan.patchReceipt(draft.id, { receipt_file_url: path });
        setReceipt(draft);
        setThumbUrl(url);

        const o = ocrOutcome.data;
        // RC-4: PDFs are scanned too (page 1 rendered server-side). A PDF we can't
        // rasterize comes back as an outcome.error, so that branch covers it now.
        if (ocrOutcome.error) setScanNote(ocrOutcome.error);
        else if (!isScannable(file)) setScanNote('File stored — it can’t be scanned; enter the details below.');
        setForm({
          vendor: o?.vendor ?? '',
          date: o?.date ?? '',
          amount: o?.total_amount != null ? String(o.total_amount) : '',
          currency: (o?.currency ?? native).toUpperCase(),
          category: o?.category ?? '',
          description: o?.description ?? '',
        });
        setPhase('review');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not process the receipt');
        setPhase('pick');
      }
    },
    [scan, lineId, native],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  // B1.5 — a file dragged onto the grid row arrives via `initialFile`: auto-start
  // the scrape pipeline once on mount (skip the pick step).
  const startedRef = useRef(false);
  useEffect(() => {
    if (initialFile && !startedRef.current) {
      startedRef.current = true;
      // One-shot kickoff of the async scrape after mount (it sets state via its
      // own phases); the set-state-in-effect rule is intentionally suppressed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void handleFile(initialFile);
    }
  }, [initialFile, handleFile]);

  // ── confirm → persist fields + back the amount with a transaction ──
  const onSave = useCallback(async () => {
    if (!receipt) return;
    const amount = Number(form.amount) || 0;
    setPhase('saving');
    setError(null);
    try {
      await scan.patchReceipt(receipt.id, {
        vendor: form.vendor || null,
        date: form.date || null,
        category: form.category || null,
        description: form.description || null,
        // B1 — store the amount in both cost columns; the scraped native currency
        // is dropped gracefully until migration 218 adds a `currency` column.
        cost_tour_currency: amount,
        cost_home_currency: amount,
      });
      const vendorName = form.vendor.trim() || receipt.receipt_number || 'Receipt';
      if (txnId) {
        // Back the EXISTING transaction with this receipt + amount (reconciled).
        await scan.linkTransaction(txnId, { receipt_id: receipt.id, amount, vendor_name: vendorName });
      } else if (amount > 0) {
        // Amount → a NEW transaction on the line (sums into actual via reconcile,
        // never a direct actual_cost write).
        await scan.createTransaction(lineId, {
          vendor_name: vendorName,
          amount,
          paid_at: form.date || null,
          receipt_id: receipt.id,
        });
      }
      onClose({ receiptId: receipt.id, label: receiptChipLabel(receipt.receipt_number, form.vendor || null), amount });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the receipt');
      setPhase('review');
    }
  }, [receipt, form, txnId, lineId, scan, onClose]);

  // ── cancel → drop the draft row (best-effort) so we don't orphan a number ──
  const onCancel = useCallback(() => {
    if (receipt && phase !== 'saving') {
      void fetch('/api/budget/receipts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: receipt.id }),
      }).catch(() => {});
    }
    onClose(null);
  }, [receipt, phase, onClose]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const field: React.CSSProperties = {
    width: '100%', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)',
    color: 'var(--lp-text)', borderRadius: 'var(--lp-radius-md)', padding: '7px 9px',
    fontSize: 'var(--lp-text-sm)', outline: 'none',
  };
  const label: React.CSSProperties = {
    fontSize: 'var(--lp-text-2xs)', fontWeight: 'var(--lp-weight-semibold)',
    letterSpacing: 'var(--lp-tracking-caps)', textTransform: 'uppercase',
    color: 'var(--lp-text-tertiary)', marginBottom: 4, display: 'block',
  };

  return (
    <div
      role="dialog"
      aria-label="Add receipt"
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as React.CSSProperties['zIndex'],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--lp-text) 45%, transparent)', padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--lp-surface)', border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-lg)', boxShadow: 'var(--lp-shadow-lg)', padding: 18,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h2 className="lp-h3">Add receipt</h2>
          <button type="button" aria-label="Close" onClick={onCancel} style={{ color: 'var(--lp-text-tertiary)', padding: 4 }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {error ? (
          <div style={{ marginBottom: 12, borderRadius: 'var(--lp-radius-md)', border: '1px solid var(--color-lp-error)', background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)', color: 'var(--color-lp-error)', fontSize: 'var(--lp-text-sm)', padding: '8px 10px' }}>
            {error}
          </div>
        ) : null}

        {phase === 'pick' ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                border: `2px dashed ${dragging ? 'var(--lp-orange)' : 'var(--lp-border-strong)'}`,
                background: dragging ? 'color-mix(in srgb, var(--lp-orange) 6%, transparent)' : 'var(--lp-bg)',
                borderRadius: 'var(--lp-radius-lg)', padding: '34px 16px', cursor: 'pointer', textAlign: 'center',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <Upload className="h-6 w-6" style={{ color: 'var(--lp-orange)' }} aria-hidden />
              <div style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)', color: 'var(--lp-text)' }}>
                Drop a receipt here, or click to choose
              </div>
              <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
                Images (JPG/PNG/WebP) are scanned automatically. PDFs are stored.
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleFile(f); }}
            />
          </>
        ) : null}

        {phase === 'scanning' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '28px 8px', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)' }}>
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--lp-orange)' }} aria-hidden />
            Uploading + scanning the receipt…
          </div>
        ) : null}

        {(phase === 'review' || phase === 'saving') ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scanNote ? (
              <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', background: 'var(--lp-bg-deep)', borderRadius: 'var(--lp-radius-md)', padding: '6px 10px' }}>
                {scanNote}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 12 }}>
              {/* thumbnail / preview */}
              <button
                type="button"
                onClick={() => !isPdf && thumbUrl && setLightbox(true)}
                title={isPdf ? 'PDF' : 'View full receipt'}
                style={{
                  flexShrink: 0, width: 92, height: 92, borderRadius: 'var(--lp-radius-md)',
                  border: '1px solid var(--lp-border)', background: 'var(--lp-bg-deep)', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: !isPdf && thumbUrl ? 'zoom-in' : 'default', padding: 0,
                }}
              >
                {!isPdf && thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl} alt="Receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <FileText className="h-7 w-7" style={{ color: 'var(--lp-text-tertiary)' }} aria-hidden />
                )}
              </button>

              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={label}>Vendor</label>
                  <input value={form.vendor} onChange={set('vendor')} style={field} placeholder="Business name" />
                </div>
                <div>
                  <label style={label}>Date</label>
                  <input type="date" value={form.date} onChange={set('date')} style={field} />
                </div>
                <div>
                  <label style={label}>Amount ({CUR_SYMBOL[form.currency] ?? form.currency})</label>
                  <input type="number" inputMode="decimal" value={form.amount} onChange={set('amount')} style={{ ...field, textAlign: 'right' }} placeholder="0" />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={label}>Category</label>
                <input value={form.category} onChange={set('category')} style={field} placeholder="hotel / transport / …" />
              </div>
              <div>
                <label style={label}>Currency</label>
                <input value={form.currency} onChange={set('currency')} maxLength={3} style={{ ...field, textTransform: 'uppercase' }} />
              </div>
            </div>
            <div>
              <label style={label}>Description</label>
              <input value={form.description} onChange={set('description')} style={field} placeholder="What was purchased" />
            </div>

            <p style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
              On save, the amount is added as a <strong>transaction</strong> on this line
              {txnId ? ' (the one you attached from)' : ''} — it reconciles into the actual,
              it doesn’t overwrite it. {form.currency !== native ? `Stored in ${native} for now (per-currency lands in B2).` : ''}
            </p>

            <div className="flex items-center justify-end" style={{ gap: 8, marginTop: 2 }}>
              <button type="button" onClick={onCancel} disabled={phase === 'saving'} className="btn-transition rounded-md px-3 py-1.5" style={{ border: '1px solid var(--lp-border)', color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)', background: 'transparent' }}>
                Cancel
              </button>
              <button type="button" onClick={() => void onSave()} disabled={phase === 'saving'} className="btn-transition inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5" style={{ background: 'var(--lp-orange)', color: 'var(--lp-text-inverse)', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', opacity: phase === 'saving' ? 0.6 : 1 }}>
                {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save receipt
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* lightbox */}
      {lightbox && thumbUrl ? (
        <div
          onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as React.CSSProperties['zIndex'], background: 'color-mix(in srgb, var(--lp-text) 78%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl} alt="Receipt" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 'var(--lp-radius-md)', boxShadow: 'var(--lp-shadow-lg)' }} />
        </div>
      ) : null}
    </div>
  );
}
