/* ============================================
   LOWPASS — useReceiptDropQueue (RC-1)

   The drop-to-stored-receipt pipeline. Owns the per-file state machine and
   NOTHING else — the panel renders it, the hook drives it.

   SAVE FIRST. Adam: "it will save". Every dropped file is persisted BEFORE OCR
   runs: create the expense_receipts row, upload the file, patch the URL on. Only
   then do we scan. A failed or skipped OCR therefore always leaves a stored
   receipt behind — it lands in `needs_manual`, never lost. This ordering is the
   whole point of the stage and the reason `ocr` is the LAST call, not the first.

   REUSES THE DECLARED SEAM. Every write goes through useReceiptScan
   (createReceipt / uploadFile / patchReceipt / ocr). No parallel path, and
   critically no money write at all in RC-1 — an amount only becomes a
   transaction when a PROPOSAL is approved (RC-2), and even then only via
   POST /api/budget/line-items/{id}/transactions. Nothing here touches
   actual_cost, directly or otherwise.

   METERING (spec decision 3). OCR is metered and rate-limited server-side, and a
   multi-file drag must not let one gesture burn the tour's quota. Two guards:
     • BATCH_OCR_CAP files per drop are scanned; the remainder still SAVE and land
       as `needs_manual` with a clear reason, so nothing is silently dropped.
     • Scans run with limited concurrency (OCR_CONCURRENCY), not all at once.
   ============================================ */

'use client';

import { useCallback, useRef, useState } from 'react';
import { useReceiptScan, isScannable, type ReceiptOcr } from '@/components/budget/useReceiptScan';

/** Max files OCR'd per drop. Extras are saved and flagged for manual entry. */
export const BATCH_OCR_CAP = 20;
/** How many scans run at once — the route is metered; don't stampede it. */
export const OCR_CONCURRENCY = 3;

export type DropItemStatus =
  | 'queued'
  | 'saving'
  | 'reading'
  | 'proposed'
  | 'needs_manual'
  | 'failed';

export interface DropItem {
  /** Client-side id; stable for the life of the queue entry. */
  key: string;
  fileName: string;
  /** object URL for the thumbnail (images only); revoked on clear. */
  previewUrl: string | null;
  status: DropItemStatus;
  /** Set once the expense_receipts row exists — proves "saved first". */
  receiptId: string | null;
  receiptNumber: string | null;
  ocr: ReceiptOcr | null;
  /** Why it needs manual entry / what failed. User-facing. */
  note: string | null;
}

let keySeq = 0;
const nextKey = () => `drop-${++keySeq}`;

export function useReceiptDropQueue(tourId: string, tourCurrency: string) {
  const scan = useReceiptScan(tourId, tourCurrency);
  const [items, setItems] = useState<DropItem[]>([]);
  const [busy, setBusy] = useState(false);
  const objectUrls = useRef<string[]>([]);

  const patch = useCallback((key: string, next: Partial<DropItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...next } : it)));
  }, []);

  /** Save one file, then (optionally) scan it. Never throws. */
  const processOne = useCallback(
    async (item: DropItem, file: File, allowOcr: boolean) => {
      // ---- 1. SAVE FIRST ------------------------------------------------
      patch(item.key, { status: 'saving' });
      let receiptId: string | null = null;
      try {
        const row = await scan.createReceipt({});
        receiptId = row.id;
        patch(item.key, { receiptId: row.id, receiptNumber: row.receipt_number });
        const up = await scan.uploadFile(row.id, file);
        if (up.path) await scan.patchReceipt(row.id, { receipt_file_url: up.path });
      } catch (e) {
        // The save itself failed — this is the only path where no receipt exists.
        patch(item.key, {
          status: 'failed',
          note: e instanceof Error ? e.message : 'Could not save this receipt.',
        });
        return;
      }

      // ---- 2. THEN scan -------------------------------------------------
      if (!allowOcr) {
        patch(item.key, {
          status: 'needs_manual',
          note: `Saved. Not scanned — over the ${BATCH_OCR_CAP}-file scan limit for one drop.`,
        });
        return;
      }
      if (!isScannable(file)) {
        // RC-4 put PDFs back on the scan path (page 1 is rendered server-side), so
        // only genuinely unreadable types land here — stored and flagged, never lost.
        patch(item.key, {
          status: 'needs_manual',
          note: 'Saved. This file type can’t be scanned — fill the details manually.',
        });
        return;
      }

      patch(item.key, { status: 'reading' });
      const outcome = await scan.ocr(file, receiptId);
      if (!outcome.data) {
        patch(item.key, {
          status: 'needs_manual',
          note: outcome.error ?? 'Couldn’t read this one — fill the details manually.',
        });
        return;
      }
      patch(item.key, { status: 'proposed', ocr: outcome.data, note: null });
    },
    [patch, scan],
  );

  /** Accept a drop / file-picker selection. */
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const entries: DropItem[] = files.map((f) => {
        const previewUrl = f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
        if (previewUrl) objectUrls.current.push(previewUrl);
        return {
          key: nextKey(),
          fileName: f.name,
          previewUrl,
          status: 'queued' as const,
          receiptId: null,
          receiptNumber: null,
          ocr: null,
          note: null,
        };
      });
      setItems((prev) => [...prev, ...entries]);
      setBusy(true);

      // Bounded concurrency — a 40-file drop must not fire 40 metered scans.
      const jobs = entries.map((entry, i) => ({ entry, file: files[i], allowOcr: i < BATCH_OCR_CAP }));
      let cursor = 0;
      const workers = Array.from({ length: Math.min(OCR_CONCURRENCY, jobs.length) }, async () => {
        for (;;) {
          const j = jobs[cursor++];
          if (!j) return;
          await processOne(j.entry, j.file, j.allowOcr);
        }
      });
      await Promise.all(workers);
      setBusy(false);
    },
    [processOne],
  );

  const clear = useCallback(() => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current = [];
    setItems([]);
  }, []);

  const counts = {
    total: items.length,
    saved: items.filter((i) => i.receiptId !== null).length,
    proposed: items.filter((i) => i.status === 'proposed').length,
    manual: items.filter((i) => i.status === 'needs_manual').length,
    failed: items.filter((i) => i.status === 'failed').length,
  };

  return { items, counts, busy, addFiles, clear };
}
