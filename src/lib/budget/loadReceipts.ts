/* ============================================
   LOWPASS — load the tour's receipts (RQ-6)

   Server-side read for the Receipts bank. Seeded into the page's HTML rather
   than fetched by the client on mount — the same reasoning as the routing
   loader: the data is already being read on the server, so shipping it in the
   payload removes a round-trip and the blank-then-populate flash.

   TWO QUERIES, joined in memory. `import_pending_lines` is fetched by receipt id
   rather than embedded, because the receipt→proposal relationship is not a
   foreign key PostgREST can traverse in both directions cleanly, and a failed
   embed would take the whole list down with it. The state derivation
   (receiptState.ts) is pure and gets both halves handed to it.

   DEGRADES TOWARD VISIBILITY. If the proposals query fails, every receipt still
   lists — it just falls back to needs_details, which over-reports work rather
   than hiding a receipt. Given the bug this surface exists to fix, showing too
   much is the safe direction to fail in.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveReceiptState,
  missingFields,
  type ProposalStatus,
  type ReceiptState,
} from './receiptState';

/** One row as the bank renders it. */
export interface ReceiptRow {
  id: string;
  receipt_number: string | null;
  vendor: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  amount: number | null;
  currency: string | null;
  /** Storage PATH, not a URL — the client re-signs on demand. */
  file_path: string | null;
  linked_line_item_id: string | null;
  /** RC-5 — which pages of a shared file this receipt covers. */
  page_from: number | null;
  page_to: number | null;
  created_at: string | null;
  state: ReceiptState;
  missing: string[];
  /* Has a scan ever RUN on this receipt? Not "did it succeed" — whether the
     attempt happened at all.

     RQ-5 FINAL cost two rounds of diagnosis because nothing surfaced this. A
     receipt that was never scanned (the upload path silently skipped it) looked
     identical to one that was scanned and read nothing. Those want opposite
     actions — Re-scan versus type it in — and the bank could not tell you which.

     Derived from raw_ocr_json's PRESENCE. The payload itself is financial/PII and
     deliberately does NOT cross to the client; only this boolean does. */
  scanned: boolean;
}

interface RawReceipt {
  id: string;
  receipt_number: string | null;
  vendor: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  cost_tour_currency: number | null;
  receipt_file_url: string | null;
  linked_line_item_id: string | null;
  page_from: number | null;
  page_to: number | null;
  created_at: string | null;
  raw_ocr_json: unknown;
}

/**
 * How many receipts still need fields — the Receipts badge (RQ-6).
 *
 * S-2b — the count used to be computed by the budget page and rendered in the
 * budget tab band. Money mode's rail shows it on every Money surface now, so it
 * needs a reader that doesn't load the whole bank: same two queries, but lean
 * projections and NO raw_ocr_json, which is the large column and is financial
 * /PII besides.
 *
 * It shares `deriveReceiptState` with loadTourReceipts deliberately. Two
 * definitions of "needs details" would drift, and the badge disagreeing with
 * the list it points at is worse than no badge.
 *
 * Never throws; 0 on any failure. A badge is not worth taking a page down for.
 */
export async function countReceiptsNeedingDetails(
  supabase: SupabaseClient,
  tourId: string,
): Promise<number> {
  if (!tourId) return 0;
  try {
    const { data: receipts, error } = await supabase
      .from('expense_receipts')
      .select('id, vendor, date, cost_tour_currency, linked_line_item_id')
      .eq('tour_id', tourId);
    if (error || !receipts?.length) return 0;

    const rows = receipts as Array<{
      id: string;
      vendor: string | null;
      date: string | null;
      cost_tour_currency: number | null;
      linked_line_item_id: string | null;
    }>;

    const statusesByReceipt = new Map<string, ProposalStatus[]>();
    const { data: proposals } = await supabase
      .from('import_pending_lines')
      .select('receipt_id, status')
      .in('receipt_id', rows.map((r) => r.id));
    for (const p of (proposals ?? []) as Array<{ receipt_id: string | null; status: string }>) {
      if (!p.receipt_id) continue;
      const list = statusesByReceipt.get(p.receipt_id) ?? [];
      list.push(p.status as ProposalStatus);
      statusesByReceipt.set(p.receipt_id, list);
    }

    return rows.filter(
      (r) =>
        deriveReceiptState({
          linked_line_item_id: r.linked_line_item_id,
          vendor: r.vendor,
          date: r.date,
          cost_tour_currency: r.cost_tour_currency,
          proposalStatuses: statusesByReceipt.get(r.id) ?? [],
        }) === 'needs_details',
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Every receipt on the tour, newest first, with its derived state.
 * Never throws — an empty list is a legitimate answer, an exception is not.
 */
export async function loadTourReceipts(
  supabase: SupabaseClient,
  tourId: string,
  tourCurrency: string,
): Promise<ReceiptRow[]> {
  if (!tourId) return [];

  const { data: receipts, error } = await supabase
    .from('expense_receipts')
    .select(
      'id, receipt_number, vendor, date, category, description, cost_tour_currency, receipt_file_url, linked_line_item_id, page_from, page_to, created_at, raw_ocr_json',
    )
    .eq('tour_id', tourId)
    .order('created_at', { ascending: false, nullsFirst: false });

  if (error || !receipts?.length) return [];
  const rows = receipts as RawReceipt[];

  /* Proposal statuses per receipt. A failure here must NOT lose the list — see
     the header: over-reporting work beats hiding a receipt. */
  const statusesByReceipt = new Map<string, ProposalStatus[]>();
  const { data: proposals } = await supabase
    .from('import_pending_lines')
    .select('receipt_id, status')
    .in('receipt_id', rows.map((r) => r.id));
  for (const p of (proposals ?? []) as Array<{ receipt_id: string | null; status: string }>) {
    if (!p.receipt_id) continue;
    const list = statusesByReceipt.get(p.receipt_id) ?? [];
    list.push(p.status as ProposalStatus);
    statusesByReceipt.set(p.receipt_id, list);
  }

  return rows.map((r) => {
    const input = {
      linked_line_item_id: r.linked_line_item_id,
      vendor: r.vendor,
      date: r.date,
      cost_tour_currency: r.cost_tour_currency,
      proposalStatuses: statusesByReceipt.get(r.id) ?? [],
    };
    return {
      id: r.id,
      receipt_number: r.receipt_number,
      vendor: r.vendor,
      date: r.date,
      category: r.category,
      description: r.description,
      amount: r.cost_tour_currency == null ? null : Number(r.cost_tour_currency),
      currency: (tourCurrency || 'GBP').toUpperCase(),
      file_path: r.receipt_file_url,
      linked_line_item_id: r.linked_line_item_id,
      page_from: r.page_from,
      page_to: r.page_to,
      created_at: r.created_at,
      state: deriveReceiptState(input),
      missing: missingFields(input),
      scanned: r.raw_ocr_json != null,
    };
  });
}
