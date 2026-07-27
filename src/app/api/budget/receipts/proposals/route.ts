/* ============================================
   LOWPASS — POST /api/budget/receipts/proposals  (RC-2b)

   Turns scanned receipts into REVIEWABLE proposals. Nothing is written to the
   budget here — this route only stages rows in `import_pending_lines`, the same
   persisted review grammar X1-B's workbook import uses (migration 244, extended
   for receipts by 251). One grammar, per the hard rule.

   Body: { tourId, receipts: [{ receiptId, ocr }] }
   Returns: { batchId, proposals: [...] }

   THE INVARIANT: no money moves in this route at all. Each proposal's payload
   carries an `amount` destined for a TRANSACTION — never an actual_cost. The
   apply route is the only writer, and it goes through
   POST /api/budget/line-items/{id}/transactions, whose handler inserts the txn
   and THEN calls syncActualCostIfNoOverride. A direct actual_cost write would
   bypass both the reconcile and the manual-override guard.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  proposeForReceipt,
  type BudgetLineFacts,
  type ReceiptFacts,
  type TransactionFacts,
} from '@/lib/budget/receiptMatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface IncomingReceipt {
  receiptId: string;
  ocr: ReceiptFacts;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tourId?: string;
      receipts?: IncomingReceipt[];
    };
    const { tourId } = body;
    const incoming = body.receipts ?? [];
    if (!tourId) return NextResponse.json({ error: 'tourId is required' }, { status: 400 });
    if (incoming.length === 0) return NextResponse.json({ error: 'No receipts supplied' }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    const workspaceId = profile.workspace_id as string;

    const { data: tour } = await supabase
      .from('tours')
      .select('id, start_date, end_date')
      .eq('id', tourId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    /* The matcher's inputs.
       SCHEMA NOTE (verified, not assumed): budget_line_items has NO vendor_name —
       vendor lives on budget_line_item_transactions, which is also why the budget
       page derives vendorByLine from transactions rather than reading it off the
       line. And transactions have NO tour_id: they hang off line_item_id +
       workspace_id, so they must be fetched BY LINE ID, not by tour. Both of those
       are why this is two sequential reads rather than one parallel pair. */
    const { data: lineRows } = await supabase
      .from('budget_line_items')
      .select('id, section, section_id, label, category, proposed_cost, actual_cost')
      .eq('tour_id', tourId);

    const lineIds = (lineRows ?? []).map((l) => l.id as string);
    const { data: txnRows } = lineIds.length
      ? await supabase
          .from('budget_line_item_transactions')
          .select('id, line_item_id, vendor_name, amount, paid_at')
          .in('line_item_id', lineIds)
      : { data: [] as Array<Record<string, unknown>> };

    const transactions: TransactionFacts[] = (txnRows ?? []).map((t) => ({
      id: t.id as string,
      lineItemId: t.line_item_id as string,
      vendorName: (t.vendor_name as string | null) ?? null,
      amount: Number(t.amount ?? 0),
      paidAt: (t.paid_at as string | null) ?? null,
    }));

    // A line's "vendor" is the vendor of its most recent transaction — the same
    // derivation the budget page uses. Gives the matcher a real name to match on.
    const vendorByLine = new Map<string, string>();
    for (const t of transactions) {
      if (t.vendorName && !vendorByLine.has(t.lineItemId)) vendorByLine.set(t.lineItemId, t.vendorName);
    }

    const lines: BudgetLineFacts[] = (lineRows ?? []).map((l) => ({
      id: l.id as string,
      sectionId: (l.section_id as string | null) ?? null,
      sectionName: (l.section as string | null) ?? null,
      label: (l.label as string | null) ?? '',
      category: (l.category as string | null) ?? null,
      estimate: (l.proposed_cost as number | null) ?? null,
      actual: (l.actual_cost as number | null) ?? null,
      vendor: vendorByLine.get(l.id as string) ?? null,
    }));

    // One batch per drop — reuses import_batches unchanged (filename is nullable,
    // status defaults to 'review').
    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({
        workspace_id: workspaceId,
        tour_id: tourId,
        filename: `${incoming.length} receipt${incoming.length === 1 ? '' : 's'}`,
        status: 'review',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (batchErr || !batch) {
      return NextResponse.json({ error: batchErr?.message ?? 'Could not open a review batch' }, { status: 500 });
    }

    // Receipt numbers make the queue readable ("R-004 · Shell").
    const { data: receiptRows } = await supabase
      .from('expense_receipts')
      .select('id, receipt_number')
      .in('id', incoming.map((r) => r.receiptId));
    const numberById = new Map(
      (receiptRows ?? []).map((r) => [r.id as string, (r.receipt_number as string | null) ?? null]),
    );

    /* RQ-7 — the tour's REAL sections. Previously the matcher only saw the
       sections implied by existing lines, so a tour section with no lines in it
       yet was invisible and the receipt's category couldn't resolve to it. */
    const { data: sectionRows } = await supabase
      .from('budget_sections')
      .select('id, name')
      .eq('tour_id', tourId);
    const sections = (sectionRows ?? []).map((s) => ({
      id: s.id as string,
      name: (s.name as string | null) ?? '',
    }));

    const pending = incoming.map((r) => {
      const p = proposeForReceipt(r.ocr, lines, transactions, {
        tourStart: tour.start_date as string | null,
        tourEnd: tour.end_date as string | null,
        sections,
      });
      return {
        workspace_id: workspaceId,
        batch_id: batch.id,
        target: p.target,
        receipt_id: r.receiptId,
        // The payload the apply path posts. `amount` → a transaction, always.
        value: {
          ...p.value,
          lineItemId: p.lineItemId,
          reason: p.reason,
          score: p.score,
        },
        source_ref: numberById.get(r.receiptId) ?? null,
        provenance: 'receipt_ocr',
        dup_of: p.dupOf,
        dup_reason: p.dupReason,
        // Duplicates stage as 'skipped' so the default decision is visible in the
        // data, not just the UI — matches X1-B's default-skip intent.
        status: p.defaultAccept ? 'pending' : 'skipped',
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from('import_pending_lines')
      .insert(pending)
      .select('id, target, value, receipt_id, source_ref, dup_of, dup_reason, status');
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ batchId: batch.id, proposals: inserted ?? [] }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Could not build receipt proposals', detail }, { status: 500 });
  }
}
