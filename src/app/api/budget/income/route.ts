/* ============================================
   LOWPASS — Budget Income API

   GET: All budget_income for a tour's routing (?tour_id=uuid),
        joined with routing; also routing dates with no income row.
   POST: Create/update budget_income (upsert on routing_id).
        Auto-computes post_tax_guarantee and post_tax_overage per math spec.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourIncome } from '@/lib/budget/income';

function postTaxFromPreTax(preTax: number, withholdingPct: number): number {
  return preTax * (1 - withholdingPct / 100);
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Shared with the server page (BudgetIncomeGrid is prop-fed) — one merge.
  const payload = await loadTourIncome(supabase, tourId, profile.workspace_id);
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: {
    routing_id: string;
    pre_tax_guarantee?: number;
    withholding_pct?: number;
    pre_tax_overage?: number;
    merch_income?: number;
    vip_income?: number;
    actual_guarantee?: number | null;
    actual_overage?: number | null;
    actual_merch?: number | null;
    actual_vip?: number | null;
    drop_count?: number | null;
    notes?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { routing_id } = body;
  if (!routing_id) {
    return NextResponse.json({ error: 'routing_id is required' }, { status: 400 });
  }

  const { data: routingRow } = await supabase
    .from('routing')
    .select('id, tour_id')
    .eq('id', routing_id)
    .maybeSingle();

  if (!routingRow) {
    return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
  }

  const { data: tourRow } = await supabase
    .from('tours')
    .select('workspace_id')
    .eq('id', routingRow.tour_id)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (!tourRow) {
    return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
  }

  const workspaceId = tourRow.workspace_id;

  /* Merge-safe upsert: per-cell edits send ONE field, so unprovided
     fields must keep their existing values (not get zeroed). Read the
     existing row, merge, recompute post-tax from the merged inputs. */
  const { data: existing } = await supabase
    .from('budget_income')
    .select('*')
    .eq('routing_id', routing_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const numMerge = (b: number | undefined, ex: unknown): number =>
    b !== undefined ? Number(b) || 0 : Number(ex ?? 0);
  const nullableMerge = (
    b: number | null | undefined,
    ex: unknown,
  ): number | null =>
    b !== undefined ? (b === null ? null : Number(b) || 0) : (ex as number | null) ?? null;

  const preTaxGuarantee = numMerge(body.pre_tax_guarantee, existing?.pre_tax_guarantee);
  const withholdingPct = numMerge(body.withholding_pct, existing?.withholding_pct);
  const preTaxOverage = numMerge(body.pre_tax_overage, existing?.pre_tax_overage);

  const payload: Record<string, unknown> = {
    routing_id,
    workspace_id: workspaceId,
    pre_tax_guarantee: preTaxGuarantee,
    withholding_pct: withholdingPct,
    post_tax_guarantee: postTaxFromPreTax(preTaxGuarantee, withholdingPct),
    pre_tax_overage: preTaxOverage,
    post_tax_overage: postTaxFromPreTax(preTaxOverage, withholdingPct),
    merch_income: numMerge(body.merch_income, existing?.merch_income),
    vip_income: numMerge(body.vip_income, existing?.vip_income),
    actual_guarantee: nullableMerge(body.actual_guarantee, existing?.actual_guarantee),
    actual_overage: nullableMerge(body.actual_overage, existing?.actual_overage),
    actual_merch: nullableMerge(body.actual_merch, existing?.actual_merch),
    actual_vip: nullableMerge(body.actual_vip, existing?.actual_vip),
    drop_count:
      body.drop_count !== undefined ? body.drop_count : (existing?.drop_count ?? null),
    notes: body.notes !== undefined ? body.notes : (existing?.notes ?? null),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('budget_income')
    .upsert(payload, { onConflict: 'routing_id' })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
