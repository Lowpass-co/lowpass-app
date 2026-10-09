/* ============================================
   LOWPASS — file a document into the tour's Receipts bank

   Two jobs, one module:

   1. insertReceiptWithNumber — the R-001, R-002 … allocation the receipts
      POST already used (max+1, retry on the unique-number collision).

   2. Phone receipts → the bank (money audit #8). The phone capture
      (/m/receipt → POST /api/expenses) wrote ONLY to `expenses`, a table no
      Budget screen reads, so every receipt photographed on tour vanished from
      the budget's point of view. Now each phone expense is also filed into
      `expense_receipts` — the Receipts bank — as a document waiting for
      details, with its photo copied to the bank's bucket. It carries no money
      until it is reviewed and applied, exactly like a dropped-in receipt.

      `syncPhoneExpensesToBank` backfills expenses captured before this fix
      (and any whose filing failed). A filed expense is marked
      status='filed', so a receipt you delete from the bank stays deleted. It is idempotent through
      expense_receipts.source_expense_id (migration 269); without that column
      it does nothing, because it would have no way to know what it already
      filed.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTourMoneyContext } from '@/lib/budget/moneyContext';
import { logServerError } from '@/lib/log/serverError';

const BANK_BUCKET = 'budget-receipts';
const PHONE_BUCKET = 'receipts';

function parseReceiptNumber(receiptNumber: string): number {
  const match = (receiptNumber ?? '').match(/^R-?(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}
const formatReceiptNumber = (n: number) => `R-${String(n).padStart(3, '0')}`;

/** Insert a receipt row with the next free R-number for its tour. */
export async function insertReceiptWithNumber(
  supabase: SupabaseClient,
  row: Record<string, unknown> & { tour_id: string; workspace_id: string },
): Promise<{ row: Record<string, unknown> } | { error: { message: string; code?: string } }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing, error: readError } = await supabase
      .from('expense_receipts')
      .select('receipt_number')
      .eq('tour_id', row.tour_id)
      .eq('workspace_id', row.workspace_id);
    if (readError) return { error: readError };
    let maxNum = 0;
    for (const r of existing ?? []) maxNum = Math.max(maxNum, parseReceiptNumber(r.receipt_number as string));
    const { data, error } = await supabase
      .from('expense_receipts')
      .insert({ ...row, receipt_number: formatReceiptNumber(maxNum + 1) })
      .select()
      .single();
    if (!error && data) return { row: data as Record<string, unknown> };
    if (error?.code === '23505') {
      // Either the number was taken (retry) or this expense is already filed.
      if (row.source_expense_id) {
        const { data: already } = await supabase
          .from('expense_receipts')
          .select('*')
          .eq('source_expense_id', row.source_expense_id as string)
          .maybeSingle();
        if (already) return { row: already as Record<string, unknown> };
      }
      continue;
    }
    if (error) return { error };
  }
  return { error: { message: 'Could not allocate a receipt number' } };
}

export interface PhoneExpense {
  id: string;
  tour_id: string;
  workspace_id: string;
  amount: number | string;
  currency: string | null;
  category: string | null;
  description: string | null;
  spent_at: string | null;
  city: string | null;
  receipt_url: string | null;
  receipt_filename: string | null;
}

const isMissingColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703' || /source_expense_id/.test(e.message ?? ''));

/**
 * File one phone expense into the Receipts bank. `file` is the photo when the
 * caller already has it in memory (the capture route); otherwise it is copied
 * from the phone bucket. Returns the bank receipt id, or null on failure
 * (logged — never thrown; the expense itself is already saved).
 */
export async function filePhoneExpense(
  supabase: SupabaseClient,
  e: PhoneExpense,
  file?: { bytes: Buffer | ArrayBuffer; contentType: string } | null,
): Promise<string | null> {
  try {
    const money = await loadTourMoneyContext(supabase, e.tour_id, e.workspace_id);
    const ccy = (e.currency ?? '').toUpperCase() || money.tourCurrency;
    const amount = Number(e.amount) || 0;
    const convertible = ccy === money.tourCurrency || money.rates[ccy] != null;
    const costTour = convertible ? Math.round(money.convert(amount, ccy, null) * 100) / 100 : 0;
    const original = `${ccy} ${amount.toFixed(2)}`;
    const notes = [
      `Captured on phone${e.city ? ` in ${e.city}` : ''}: ${original}.`,
      convertible ? null : `No ${ccy}→${money.tourCurrency} rate on this tour yet — add one in Budget settings, then fill in the amount.`,
    ].filter(Boolean).join(' ');

    const base: Record<string, unknown> & { tour_id: string; workspace_id: string } = {
      tour_id: e.tour_id,
      workspace_id: e.workspace_id,
      date: e.spent_at ? String(e.spent_at).slice(0, 10) : null,
      vendor: null,
      category: e.category,
      description: e.description,
      payment_method: 'card',
      cost_tour_currency: costTour,
      cost_home_currency: 0,
      in_budget: false,
      notes,
      source_expense_id: e.id,
    };
    let res = await insertReceiptWithNumber(supabase, base);
    if ('error' in res && isMissingColumn(res.error)) {
      // Migration 269 not pasted yet — file it without the link.
      const { source_expense_id: _drop, ...rest } = base;
      void _drop;
      res = await insertReceiptWithNumber(supabase, rest as typeof base);
    }
    if ('error' in res) {
      logServerError('filePhoneExpense: insert', res.error, { expenseId: e.id });
      return null;
    }
    const receiptId = String(res.row.id);
    // Mark the expense FILED, so deleting its receipt from the bank is final —
    // otherwise the backfill would see an unlinked expense and file it again.
    await supabase.from('expenses').update({ status: 'filed' }).eq('id', e.id);
    if (res.row.receipt_file_url) return receiptId; // already filed earlier

    // The photo → the bank's bucket, at the path its readers sign.
    let bytes = file?.bytes ?? null;
    let contentType = file?.contentType ?? 'image/jpeg';
    if (!bytes && e.receipt_url) {
      const { data: blob, error: dlErr } = await supabase.storage.from(PHONE_BUCKET).download(e.receipt_url);
      if (dlErr || !blob) {
        logServerError('filePhoneExpense: download', dlErr, { expenseId: e.id });
        return receiptId; // filed without its image; the bank shows it needs details
      }
      bytes = await blob.arrayBuffer();
      contentType = blob.type || contentType;
    }
    if (bytes) {
      const name = (e.receipt_filename ?? 'receipt.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'receipt.jpg';
      const path = `tours/${e.tour_id}/receipts/${receiptId}/${name}`;
      const { error: upErr } = await supabase.storage.from(BANK_BUCKET).upload(path, bytes, { contentType, upsert: true });
      if (upErr) {
        logServerError('filePhoneExpense: upload', upErr, { expenseId: e.id });
      } else {
        await supabase.from('expense_receipts').update({ receipt_file_url: path }).eq('id', receiptId);
      }
    }
    return receiptId;
  } catch (err) {
    logServerError('filePhoneExpense', err, { expenseId: e.id });
    return null;
  }
}

/** Backfill: file every phone expense on the tour that isn't in the bank yet. */
export async function syncPhoneExpensesToBank(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<number> {
  const filed = await supabase
    .from('expense_receipts')
    .select('source_expense_id')
    .eq('tour_id', tourId)
    .not('source_expense_id', 'is', null);
  if (filed.error) {
    // No column yet (269 not pasted) → nothing can be backfilled safely.
    if (!isMissingColumn(filed.error)) logServerError('syncPhoneExpensesToBank', filed.error, { tourId });
    return 0;
  }
  const done = new Set((filed.data ?? []).map((r) => (r as { source_expense_id: string }).source_expense_id));
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, tour_id, workspace_id, amount, currency, category, description, spent_at, city, receipt_url, receipt_filename')
    .eq('tour_id', tourId)
    .eq('workspace_id', workspaceId)
    .neq('status', 'filed');
  if (error) {
    logServerError('syncPhoneExpensesToBank: expenses', error, { tourId });
    return 0;
  }
  let n = 0;
  for (const e of (expenses ?? []) as PhoneExpense[]) {
    if (done.has(e.id)) continue;
    if (await filePhoneExpense(supabase, e)) n++;
  }
  return n;
}
