'use client';

/* ============================================
   LOWPASS — useReceiptScan (Receipts overhaul B1)

   The single seam for the receipt flow: upload → OCR (Claude Vision) → persist
   (expense_receipts) → link to a line/transaction. The desktop Add-Receipt panel
   uses it now; ReceiptsGrid adopts it in B2 (and finally stores its image), so
   the two surfaces can't drift into parallel half-systems (D-UNIFY).

   Reuses the EXISTING routes — no duplication:
     • POST /api/budget/receipts            (CRUD create, auto R-00n)
     • POST /api/budget/receipts/upload     (signed-URL upload → { path, url })
     • POST /api/budget/receipts/ocr        (Claude Vision — metered + rate-limited)
     • PATCH /api/budget/receipts           (fields + receipt_file_url)
     • GET  /api/budget/receipts/sign       (re-sign a stored path)
     • POST /api/budget/line-items/{id}/transactions  (amount → txn → reconcile)
     • PATCH /api/budget/transactions/{id}  (link receipt to an existing txn)

   D-SCRAPE: OCR is a SUGGESTION the user confirms; the amount only ever lands as
   a transaction (which sums into actual_cost via the existing reconcile) — never
   a direct actual_cost write. PDF = store-but-don't-scan (Vision is images-only).
   ============================================ */

import { useMemo } from 'react';

export const OCR_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const isOcrableImage = (file: File): boolean => OCR_IMAGE_TYPES.includes(file.type);

/** The OCR route's JSON shape (Claude Vision). All fields may be null. */
export interface ReceiptOcr {
  vendor: string | null;
  date: string | null;
  total_amount: number | null;
  currency: string | null;
  category: string | null;
  description: string | null;
  payment_method: string | null;
}

/** A persisted expense_receipts row (the fields B1 touches). */
export interface ReceiptRow {
  id: string;
  receipt_number: string | null;
  vendor: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  payment_method: string | null;
  cost_tour_currency: number | null;
  cost_home_currency: number | null;
  receipt_file_url: string | null;
  in_budget: boolean | null;
  linked_line_item_id: string | null;
}

export interface ReceiptFields {
  vendor?: string | null;
  date?: string | null;
  category?: string | null;
  description?: string | null;
  payment_method?: string | null;
  cost_tour_currency?: number | null;
  cost_home_currency?: number | null;
  receipt_file_url?: string | null;
  in_budget?: boolean | null;
  linked_line_item_id?: string | null;
}

export interface OcrOutcome {
  data: ReceiptOcr | null;
  /** A user-facing message when the scan couldn't run (AI cap, rate limit, non-image). */
  error: string | null;
}

export interface UseReceiptScan {
  /** Run Claude Vision OCR on an image (skips PDFs → {data:null}). Best-effort:
   *  a failure returns an error message; the caller still proceeds to manual entry. */
  ocr: (file: File) => Promise<OcrOutcome>;
  /** Create the expense_receipts row (auto-numbered). */
  createReceipt: (fields: ReceiptFields) => Promise<ReceiptRow>;
  /** Upload a file to the private bucket → { path, url }. Caller stores `path`. */
  uploadFile: (receiptId: string, file: File) => Promise<{ path: string; url: string | null }>;
  /** PATCH receipt fields (+ receipt_file_url). */
  patchReceipt: (id: string, fields: ReceiptFields) => Promise<ReceiptRow>;
  /** Amount → a NEW transaction on the line (sums to actual via reconcile). */
  createTransaction: (lineId: string, t: { vendor_name: string; amount: number; paid_at?: string | null; receipt_id?: string | null }) => Promise<void>;
  /** Link a receipt (and optionally its amount) to an EXISTING transaction. */
  linkTransaction: (txnId: string, patch: { receipt_id?: string | null; amount?: number; vendor_name?: string }) => Promise<void>;
  /** Re-sign a stored receipt file path → a short-lived URL for display. */
  signUrl: (receiptId: string) => Promise<string | null>;
}

export function useReceiptScan(tourId: string, tourCurrency: string): UseReceiptScan {
  return useMemo<UseReceiptScan>(() => {
    const native = (tourCurrency || 'GBP').toUpperCase();
    return {
      async ocr(file) {
        if (!isOcrableImage(file)) {
          return { data: null, error: null }; // PDF / non-image → manual entry, no scan
        }
        try {
          const fd = new FormData();
          fd.set('file', file);
          fd.set('tour_id', tourId);
          fd.set('currency', native);
          const res = await fetch('/api/budget/receipts/ocr', { method: 'POST', body: fd });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            return { data: null, error: body.error ?? 'Could not scan the receipt — enter the details manually.' };
          }
          const raw = (await res.json()) as Record<string, unknown>;
          const numOrNull = (v: unknown): number | null => (v == null || v === '' ? null : Number(v) || 0);
          const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
          return {
            data: {
              vendor: strOrNull(raw.vendor),
              date: strOrNull(raw.date),
              total_amount: numOrNull(raw.total_amount),
              currency: strOrNull(raw.currency),
              category: strOrNull(raw.category),
              description: strOrNull(raw.description),
              payment_method: strOrNull(raw.payment_method),
            },
            error: null,
          };
        } catch {
          return { data: null, error: 'Could not reach the scanner — enter the details manually.' };
        }
      },

      async createReceipt(fields) {
        const res = await fetch('/api/budget/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, ...fields }),
        });
        if (!res.ok) throw new Error('Could not create the receipt');
        return (await res.json()) as ReceiptRow;
      },

      async uploadFile(receiptId, file) {
        const fd = new FormData();
        fd.set('file', file);
        fd.set('tour_id', tourId);
        fd.set('receipt_id', receiptId);
        const res = await fetch('/api/budget/receipts/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Upload failed');
        }
        return (await res.json()) as { path: string; url: string | null };
      },

      async patchReceipt(id, fields) {
        const res = await fetch('/api/budget/receipts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...fields }),
        });
        if (!res.ok) throw new Error('Could not save the receipt');
        return (await res.json()) as ReceiptRow;
      },

      async createTransaction(lineId, t) {
        const res = await fetch(`/api/budget/line-items/${lineId}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        if (!res.ok) throw new Error('Could not add the transaction');
      },

      async linkTransaction(txnId, patch) {
        const res = await fetch(`/api/budget/transactions/${txnId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('Could not link the receipt to the transaction');
      },

      async signUrl(receiptId) {
        try {
          const res = await fetch(`/api/budget/receipts/sign?receipt_id=${encodeURIComponent(receiptId)}`);
          if (!res.ok) return null;
          return ((await res.json()) as { url: string | null }).url;
        } catch {
          return null;
        }
      },
    };
  }, [tourId, tourCurrency]);
}

/** A short chip label for a receipt (vendor, else R-number). */
export function receiptChipLabel(receiptNumber: string | null, vendor: string | null): string {
  if (vendor && vendor.trim()) return vendor.trim();
  return receiptNumber ?? 'Receipt';
}
