/* ============================================
   LOWPASS — POST /api/budget/receipts/proposals/apply  (RC-2b)

   Commits a reviewed receipt batch. Mirrors X1-B's workbook apply exactly:
   body { batchId, accept: string[], edits?: Record<id, Partial<value>> }, accepted
   rows write through the SAME UI paths (forwarding the caller's session cookie),
   everything else is marked rejected.

   THE INVARIANT — this route is where it lives or dies:
     receipt_txn   → POST /api/budget/line-items/{id}/transactions
     receipt_line  → POST /api/budget/line-items  (actual_cost: 0)
                     THEN POST .../transactions
   The amount ONLY ever lands as a transaction. The transactions route inserts the
   row and then calls syncActualCostIfNoOverride, so actual_cost is DERIVED from
   the transaction sum and is skipped entirely when the user holds a manual
   override. A direct actual_cost write would bypass both — which is why the
   created line is opened at actual_cost 0 and left for the transaction to move.

   EDITS: the spec requires every proposed value to be editable before approving.
   `edits[pendingId]` is merged over the stored `value` at apply time, so what gets
   written is what the reviewer saw and changed — not what the OCR guessed.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ProposalValue {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  label?: string;
  sectionName?: string | null;
  /** RQ-7 — the named section doesn't exist yet; create it before the line. */
  createSection?: boolean;
  sectionReason?: string;
  lineItemId?: string | null;
  reason?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      batchId?: string;
      accept?: string[];
      edits?: Record<string, Partial<ProposalValue>>;
    };
    const { batchId } = body;
    const acceptIds = new Set(body.accept ?? []);
    const edits = body.edits ?? {};
    if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

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

    const { data: batch } = await supabase
      .from('import_batches')
      .select('id, tour_id, workspace_id, status')
      .eq('id', batchId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    if (batch.status === 'applied') {
      return NextResponse.json({ error: 'Batch already applied' }, { status: 409 });
    }

    const { data: rows } = await supabase
      .from('import_pending_lines')
      .select('id, target, value, receipt_id, status')
      .eq('batch_id', batchId)
      .eq('workspace_id', workspaceId);

    const origin = new URL(request.url).origin;
    const cookie = request.headers.get('cookie') ?? '';
    const now = new Date().toISOString();
    let linked = 0;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of (rows ?? []) as Array<{
      id: string;
      target: string;
      value: ProposalValue;
      receipt_id: string | null;
      status: string;
    }>) {
      if (!acceptIds.has(row.id)) {
        // Rejected / skipped: the RECEIPT STAYS STORED and unproposed, per RC-3 —
        // only the proposal is closed out. No ledger rows are written.
        await supabase
          .from('import_pending_lines')
          .update({ status: 'rejected', reviewed_at: now, reviewed_by: user.id })
          .eq('id', row.id);
        skipped++;
        continue;
      }

      // What the reviewer actually approved.
      const v: ProposalValue = { ...row.value, ...(edits[row.id] ?? {}) };
      const amount = Number(v.amount ?? 0);
      const vendorName = (v.vendor ?? '').trim() || 'Receipt';
      if (!Number.isFinite(amount) || amount === 0) {
        errors.push(`${row.id}: no amount to record`);
        continue;
      }

      let lineItemId = v.lineItemId ?? null;

      /* RQ-7 — the proposal may ask for a SECTION that doesn't exist yet, rather
         than having quietly resolved to Uncategorised. Create it first, through
         the existing sections route, so the new line has somewhere real to live.
         Best-effort: if the section can't be created we still make the line, and
         it lands under the proposed name the way it would have before. */
      if (row.target === 'receipt_line' && v.createSection && v.sectionName) {
        await fetch(`${origin}/api/budget/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ tour_id: batch.tour_id, name: v.sectionName }),
        }).catch(() => {});
      }

      // (b) create the line first — at actual_cost 0. The TRANSACTION moves the
      // actual, via the reconcile. Never a direct actual_cost write.
      if (row.target === 'receipt_line') {
        const res = await fetch(`${origin}/api/budget/line-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({
            tour_id: batch.tour_id,
            label: v.label ?? vendorName,
            category: v.sectionName ?? 'Uncategorised',
            section: v.sectionName ?? 'Uncategorised',
            proposed_cost: amount,
            actual_cost: 0,
            currency: v.currency ?? undefined,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          errors.push(`${row.id}: ${j.error ?? 'could not create the line'}`);
          continue;
        }
        // VERIFIED shape: POST /api/budget/line-items ends in
        // `NextResponse.json(created)` — the created ROW itself, so the id is
        // top-level. (`lineItem` kept only as a defensive fallback.)
        const j = (await res.json().catch(() => ({}))) as { id?: string; lineItem?: { id?: string } };
        lineItemId = j.id ?? j.lineItem?.id ?? null;
        if (!lineItemId) {
          errors.push(`${row.id}: line created but no id returned`);
          continue;
        }
        created++;
      } else {
        linked++;
      }

      if (!lineItemId) {
        errors.push(`${row.id}: no target line`);
        continue;
      }

      // THE ONLY MONEY WRITE — a transaction. actual_cost follows from it.
      const txnRes = await fetch(`${origin}/api/budget/line-items/${lineItemId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          tour_id: batch.tour_id,
          vendor_name: vendorName,
          amount,
          paid_at: v.date ?? null,
          receipt_id: row.receipt_id ?? null,
        }),
      });
      if (!txnRes.ok) {
        const j = (await txnRes.json().catch(() => ({}))) as { error?: string };
        errors.push(`${row.id}: ${j.error ?? 'could not record the transaction'}`);
        continue;
      }

      // Close the loop on the receipt itself: filed, and pointing at its line.
      if (row.receipt_id) {
        await supabase
          .from('expense_receipts')
          .update({ in_budget: true, linked_line_item_id: lineItemId })
          .eq('id', row.receipt_id);
      }

      await supabase
        .from('import_pending_lines')
        .update({ status: 'accepted', reviewed_at: now, reviewed_by: user.id })
        .eq('id', row.id);
    }

    await supabase.from('import_batches').update({ status: 'applied' }).eq('id', batchId);

    return NextResponse.json({
      linked,
      created,
      skipped,
      errors,
      // The one-line summary RC-3 shows after a batch.
      summary: `${rows?.length ?? 0} receipts · ${linked} linked · ${created} new line${created === 1 ? '' : 's'} · ${skipped} skipped`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Receipt apply failed', detail }, { status: 500 });
  }
}
