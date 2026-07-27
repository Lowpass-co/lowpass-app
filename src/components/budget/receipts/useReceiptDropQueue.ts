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
import { pageRangeLabel, type ReceiptDocument } from '@/lib/budget/receiptDocuments';
import { parseReceiptFilename, filenameNote } from '@/lib/budget/receiptFilename';

/** Max files OCR'd per drop. Extras are saved and flagged for manual entry. */
export const BATCH_OCR_CAP = 20;
/* RQ-5 FOLLOW-UP — scans run ONE AT A TIME, and a 429 is retried.

   This was 3-at-once, which fought the route's own limiter: the OCR endpoint
   allows one call per user per 3s (RATE_LIMIT_MS), so firing three in parallel
   meant two came straight back 429 "Slow down — try again in 2s" and their
   receipts landed in needs_manual for no reason but our own pacing.

   Deliberately NOT a fixed 3.3s gap between every file: a scan already takes a
   second or two, so a blanket wait would add a minute to a 20-file drop to solve
   a problem that mostly isn't there. Concurrency 1 stops the stampede; the retry
   handles the cases where sequential still isn't slow enough. The SERVER stays
   the authority on pace — the client just stops arguing with it. */
export const OCR_CONCURRENCY = 1;
/** How long to back off after a 429 — wider than the route's 3s window. */
export const OCR_BACKOFF_MS = 3_300;
/** A 429 is transient; retry a bounded number of times before giving up. */
export const OCR_RETRIES = 2;
/* RQ-2 — the single upload size limit. Two receipt surfaces used to disagree:
   the modal inbox enforced 10 MB, this queue enforced nothing, so the same file
   was accepted by one and refused by the other. The inbox is retired and its
   guard moved here, which is now the only place a receipt enters the app. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Extensions the receipt surfaces accept (mirrors the file input's `accept`). */
export const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

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
  /** RC-5 — which pages of the uploaded file this receipt covers. Null = all. */
  pages?: number[] | null;
  /** RQ-5 — the fields came from the FILENAME, not from a read. Never hide this. */
  fromFilename?: boolean;
  /** Why it needs manual entry / what failed. User-facing. */
  note: string | null;
}

let keySeq = 0;
const nextKey = () => `drop-${++keySeq}`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True when the scan came back refused for pace rather than for content. */
function isRateLimited(error: string | null): boolean {
  return !!error && /slow down|rate limit|try again in/i.test(error);
}

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
      let storedPath: string | null = null;
      try {
        const row = await scan.createReceipt({});
        receiptId = row.id;
        patch(item.key, { receiptId: row.id, receiptNumber: row.receipt_number });
        const up = await scan.uploadFile(row.id, file);
        storedPath = up.path ?? null;
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
        // RC-4/RC-5 put PDFs on the scan path (whole document, not page 1), so
        // only genuinely unreadable types land here — stored and flagged, never lost.
        patch(item.key, {
          status: 'needs_manual',
          note: 'Saved. This file type can’t be scanned — fill the details manually.',
        });
        return;
      }

      patch(item.key, { status: 'reading' });
      /* Retry a rate-limit refusal rather than burning the receipt on it. The
         message the route sends is user-facing ("Slow down — try again in Ns"),
         so match on the status word rather than parsing it. */
      let outcome = await scan.ocr(file, receiptId);
      for (let attempt = 0; attempt < OCR_RETRIES && !outcome.data && isRateLimited(outcome.error); attempt++) {
        patch(item.key, { note: 'Waiting for the scanner…' });
        await sleep(OCR_BACKOFF_MS);
        outcome = await scan.ocr(file, receiptId);
      }
      if (!outcome.data) {
        /* RQ-5 — the scan failed, but the FILENAME may already carry what it was
           looking for: Adam names files "date | vendor | description | $amount".
           Retyping what he already typed is a worse outcome than a labelled
           guess. Everything filled here is marked as coming from the filename,
           and the note says so — a guess must never look like a reading. */
        const fromName = parseReceiptFilename(file.name);
        if (fromName.fields.length > 0) {
          patch(item.key, {
            status: 'needs_manual',
            fromFilename: true,
            ocr: {
              vendor: fromName.vendor,
              date: fromName.date,
              total_amount: fromName.amount,
              currency: null,
              category: null,
              description: fromName.description,
              payment_method: null,
            },
            note: filenameNote(fromName),
          });
          return;
        }
        patch(item.key, {
          status: 'needs_manual',
          note: outcome.error ?? 'Couldn’t read this one — fill the details manually.',
        });
        return;
      }

      /* RC-5 — the file we just saved may hold SEVERAL receipts (a TM scanning a
         week's stack). Document 0 stays on the row we already created; each of the
         rest gets its OWN expense_receipts row against the SAME stored file, told
         apart by page range. Every proposal therefore still points at a real
         receipt a reviewer can open.

         Siblings are created with NO cost — like every other receipt row, the
         amount only becomes money when a proposal is approved and a transaction
         is written. A sibling that fails to create is skipped, not fatal: the
         file and its first receipt are already safe. */
      // `documents` is defensive-read: an older/partial outcome still has `data`,
      // and one missing field must not throw away a receipt we already saved.
      const docs: ReceiptDocument[] = outcome.documents?.length
        ? outcome.documents
        : [{ ...outcome.data, pages: null, line_items: null }];
      const [first, ...rest] = docs;
      const siblings: DropItem[] = [];
      for (const doc of rest) {
        try {
          const row = await scan.createReceipt({
            page_from: doc.pages?.[0] ?? null,
            page_to: doc.pages?.[doc.pages.length - 1] ?? null,
          });
          if (storedPath) await scan.patchReceipt(row.id, { receipt_file_url: storedPath });
          siblings.push({
            key: nextKey(),
            fileName: file.name,
            previewUrl: null,
            status: 'proposed',
            receiptId: row.id,
            receiptNumber: row.receipt_number,
            ocr: {
              vendor: doc.vendor,
              date: doc.date,
              total_amount: doc.total_amount,
              currency: doc.currency,
              category: doc.category,
              description: doc.description,
              payment_method: doc.payment_method,
            },
            pages: doc.pages ?? null,
            note: pageRangeLabel(doc.pages) || null,
          });
        } catch {
          /* one sibling lost is not the file lost — keep going */
        }
      }
      if (siblings.length) setItems((prev) => [...prev, ...siblings]);

      patch(item.key, {
        status: 'proposed',
        ocr: {
          vendor: first.vendor,
          date: first.date,
          total_amount: first.total_amount,
          currency: first.currency,
          category: first.category,
          description: first.description,
          payment_method: first.payment_method,
        },
        pages: first.pages ?? null,
        note: siblings.length
          ? `${siblings.length + 1} receipts found in this file`
          : pageRangeLabel(first.pages) || null,
      });
    },
    [patch, scan],
  );

  /** Accept a drop / file-picker selection. */
  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      /* RQ-2 — reject too-big / wrong-extension files VISIBLY. They still get a
         row saying why; a file that vanishes on drop reads as "it worked". */
      const rejected: DropItem[] = [];
      const accepted: File[] = [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() ?? '').toLowerCase();
        const reason = !ALLOWED_EXT.includes(ext)
          ? 'Not a receipt file — images or PDFs only.'
          : f.size > MAX_FILE_BYTES
            ? `Too big — ${(f.size / 1_048_576).toFixed(1)} MB, the limit is ${MAX_FILE_BYTES / 1_048_576} MB.`
            : null;
        if (reason) {
          rejected.push({
            key: nextKey(),
            fileName: f.name,
            previewUrl: null,
            status: 'failed',
            receiptId: null,
            receiptNumber: null,
            ocr: null,
            note: reason,
          });
        } else {
          accepted.push(f);
        }
      }

      const entries: DropItem[] = accepted.map((f) => {
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
      setItems((prev) => [...prev, ...rejected, ...entries]);
      if (entries.length === 0) return;
      setBusy(true);

      // Bounded concurrency — a 40-file drop must not fire 40 metered scans.
      const jobs = entries.map((entry, i) => ({ entry, file: accepted[i], allowOcr: i < BATCH_OCR_CAP }));
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
