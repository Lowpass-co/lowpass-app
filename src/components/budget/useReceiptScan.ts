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
   a direct actual_cost write.

   RC-4: PDFs ARE scanned now. Vision is still images-only, but the route renders
   page 1 to a PNG server-side first (src/lib/budget/pdfFirstPage.ts) and feeds
   that to Vision. If the render fails the route 400s with a manual-entry message,
   so store-and-flag survives as the fallback — a receipt is never lost.
   ============================================ */

import { useMemo } from 'react';
import {
  effectiveMediaType,
  isScannableFile,
  IMAGE_TYPES,
  PDF_TYPE,
} from '@/lib/budget/mediaType';
import type { ReceiptDocument } from '@/lib/budget/receiptDocuments';

export type { ReceiptDocument };

export const OCR_IMAGE_TYPES = IMAGE_TYPES as readonly string[];
export const OCR_PDF_TYPE = PDF_TYPE;
/** True when the file IS an image (not merely scannable) — thumbnails, previews. */
export const isOcrableImage = (file: File): boolean =>
  (effectiveMediaType(file.name, file.type) ?? '').startsWith('image/');

/**
 * What we'll send to the scanner. Images go to Vision; PDFs go whole as a
 * document block (RC-5).
 *
 * RQ-5 FINAL — decided by name AND reported type, not by `file.type` alone.
 * Trusting the browser's type is what silently skipped the scan on Adam's two
 * receipts: an empty or generic type made this false, no scan was attempted, and
 * the receipt looked unreadable when nothing had tried to read it.
 */
export const isScannable = (file: File): boolean => isScannableFile(file.name, file.type);

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
  /** RC-5 — page range within a shared uploaded file. Both or neither (252 CHECK). */
  page_from?: number | null;
  page_to?: number | null;
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
  /** The FIRST document — what single-receipt surfaces have always consumed. */
  data: ReceiptOcr | null;
  /** RC-5 — every document found in the file. One folio → 1; a scanned stack → N.
   *  `data` is `documents[0]`; a caller that can split reads this instead. */
  documents: ReceiptDocument[];
  /** A user-facing message when the scan couldn't run (AI cap, rate limit, non-image). */
  error: string | null;
}

export interface UseReceiptScan {
  /** Run Claude Vision OCR on an image (skips PDFs → {data:null}). Best-effort:
   *  a failure returns an error message; the caller still proceeds to manual entry.
   *  B2 — pass `receiptId` so the route persists the extraction (raw_ocr_json +
   *  extracted_text) for ⌘K search. Omit it for a stateless pre-create scan. */
  ocr: (file: File, receiptId?: string | null) => Promise<OcrOutcome>;
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
      async ocr(file, receiptId) {
        if (!isScannable(file)) {
          // unscannable type → manual entry, no scan
          return { data: null, documents: [], error: null };
        }
        try {
          const fd = new FormData();
          fd.set('file', file);
          fd.set('tour_id', tourId);
          /* Tell the route what this file actually is. The browser's own type can
             be empty or generic, and FormData carries that straight through — so
             without this the route would refuse the very files the client just
             agreed to scan. The route re-derives it anyway; this is a hint, not
             a trust boundary. */
          const resolved = effectiveMediaType(file.name, file.type);
          if (resolved) fd.set('media_type', resolved);
          fd.set('currency', native);
          // B2 — when supplied, the route persists the extraction onto this receipt.
          if (receiptId) fd.set('receipt_id', receiptId);
          const res = await fetch('/api/budget/receipts/ocr', { method: 'POST', body: fd });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            return {
              data: null,
              documents: [],
              error: body.error ?? 'Could not scan the receipt — enter the details manually.',
            };
          }
          /* RC-5 — the route already normalised the model's JSON into documents[]
             (src/lib/budget/receiptDocuments.ts), so there is nothing to re-parse
             here. `data` stays documents[0] for the single-receipt surfaces. */
          const raw = (await res.json()) as { documents?: ReceiptDocument[] };
          const documents = Array.isArray(raw.documents) ? raw.documents : [];
          const first = documents[0] ?? null;
          return {
            data: first
              ? {
                  vendor: first.vendor,
                  date: first.date,
                  total_amount: first.total_amount,
                  currency: first.currency,
                  category: first.category,
                  description: first.description,
                  payment_method: first.payment_method,
                }
              : null,
            documents,
            error: null,
          };
        } catch {
          return {
            data: null,
            documents: [],
            error: 'Could not reach the scanner — enter the details manually.',
          };
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
