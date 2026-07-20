/* ============================================
   LOWPASS — POST /api/import/workbook  (X1-B)

   Accepts an uploaded workbook (ours re-edited, or a foreign one) and STAGES its
   rows as PROPOSALS — never a direct write. Multipart: `file`, `tourId`, optional
   `map` (JSON, confirmed foreign column mapping).

     • foreign layout, no map → returns the column-mapping preview (user confirms).
     • our layout OR foreign+map → creates an import_batch + import_pending_lines
       (dedupe-classified) and returns them for the review queue.

   Settlement/payroll sheets are rejected (read-only). Nothing writes to budget here;
   accepted proposals are written later by /api/import/workbook/apply through the
   existing line-items path.
   ============================================ */

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseWorkbook, applyMapping, type SheetRows, type ParsedProposal } from '@/lib/import/parseWorkbook';
import { classifyProposals, type ExistingLine } from '@/lib/import/dedupe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const tourId = String(form.get('tourId') ?? '');
    const mapRaw = form.get('map');
    if (!(file instanceof File) || !tourId) {
      return NextResponse.json({ error: 'file and tourId are required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
    if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });
    const workspaceId = profile.workspace_id as string;

    const { data: tour } = await supabase
      .from('tours').select('id, currency, workspace_id')
      .eq('id', tourId).eq('workspace_id', workspaceId).maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
    const currency = (tour.currency as string | null) ?? 'GBP';

    // Parse the workbook → JSON rows per sheet.
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheets: SheetRows = {};
    for (const name of wb.SheetNames) sheets[name] = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);

    let proposals: ParsedProposal[];
    let rejected: string[];
    const map = mapRaw ? (JSON.parse(String(mapRaw)) as { sheet: string; name?: string; amount?: string; date?: string; section?: string }) : null;
    if (map?.sheet && sheets[map.sheet]) {
      proposals = applyMapping(map.sheet, sheets[map.sheet], map, currency);
      rejected = [];
    } else {
      const parsed = parseWorkbook(sheets, currency);
      if (parsed.layout === 'foreign') {
        return NextResponse.json({ layout: 'foreign', mapping: parsed.mapping, rejected: parsed.rejected });
      }
      proposals = parsed.proposals;
      rejected = parsed.rejected;
    }

    if (proposals.length === 0) {
      return NextResponse.json({ error: 'No importable rows found in the workbook', rejected }, { status: 422 });
    }

    // Existing budget lines for dedupe (section name resolved).
    const [{ data: lineRows }, { data: sectionRows }] = await Promise.all([
      supabase.from('budget_line_items').select('id, label, category, section_id, proposed_cost, actual_cost').eq('tour_id', tourId),
      supabase.from('budget_sections').select('id, name').eq('tour_id', tourId),
    ]);
    const sectionName = new Map(((sectionRows ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
    const existing: ExistingLine[] = ((lineRows ?? []) as Array<{ id: string; label: string; category: string | null; section_id: string | null; proposed_cost: number | null; actual_cost: number | null }>).map((l) => ({
      id: l.id,
      section: String((l.section_id ? sectionName.get(l.section_id) : null) || l.category || 'Uncategorised'),
      label: l.label ?? '',
      amount: Number(l.actual_cost) || Number(l.proposed_cost) || 0,
    }));
    const classified = classifyProposals(proposals, existing);

    // Stage the batch + pending lines.
    const { data: batch, error: bErr } = await supabase.from('import_batches')
      .insert({ workspace_id: workspaceId, tour_id: tourId, filename: file.name, status: 'review', created_by: user.id })
      .select().single();
    if (bErr || !batch) return NextResponse.json({ error: bErr?.message ?? 'Could not create batch' }, { status: 500 });

    const pendingRows = classified.map((c) => ({
      workspace_id: workspaceId,
      batch_id: batch.id as string,
      target: c.proposal.target,
      value: c.proposal.value,
      source_ref: c.proposal.source_ref,
      provenance: c.kind,
      dup_of: c.dupOf,
      dup_reason: c.dupReason,
      status: 'pending',
    }));
    const { data: pending, error: pErr } = await supabase.from('import_pending_lines').insert(pendingRows).select();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    return NextResponse.json({
      layout: 'ours',
      batchId: batch.id,
      rejected,
      lines: (pending ?? []).map((row, i) => ({
        id: row.id,
        label: classified[i].proposal.value.label,
        section: classified[i].proposal.value.section,
        amount: classified[i].proposal.value.actual_cost || classified[i].proposal.value.proposed_cost,
        kind: classified[i].kind,
        dupReason: classified[i].dupReason,
        defaultAccept: classified[i].defaultAccept,
        source_ref: classified[i].proposal.source_ref,
      })),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Import parse failed', detail }, { status: 500 });
  }
}
