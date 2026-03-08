/* ============================================
   LOWPASS — Budget Income API

   GET: All budget_income for a tour's routing (?tour_id=uuid),
        joined with routing; also routing dates with no income row.
   POST: Create/update budget_income (upsert on routing_id).
        Auto-computes post_tax_guarantee and post_tax_overage per math spec.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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

  const { data: routingRows, error: routingError } = await supabase
    .from('routing')
    .select('id, date, venue_name, city, day_type')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  if (routingError) {
    return NextResponse.json({ error: routingError.message }, { status: 500 });
  }

  const routingIds = (routingRows ?? []).map((r) => r.id);
  if (routingIds.length === 0) {
    return NextResponse.json({
      income: [],
      routing_only: routingRows ?? [],
    });
  }

  const { data: incomeRows, error: incomeError } = await supabase
    .from('budget_income')
    .select('*, routing(date, venue_name, city, day_type)')
    .in('routing_id', routingIds)
    .eq('workspace_id', profile.workspace_id);

  if (incomeError) {
    return NextResponse.json({ error: incomeError.message }, { status: 500 });
  }

  const incomeWithRouting = (incomeRows ?? []).map((row) => ({
    ...row,
    routing: Array.isArray(row.routing) ? row.routing[0] : row.routing,
  }));
  const incomeSorted = incomeWithRouting.slice().sort((a, b) => {
    const dateA = (a.routing as { date?: string })?.date ?? '';
    const dateB = (b.routing as { date?: string })?.date ?? '';
    return dateA.localeCompare(dateB);
  });

  const incomeRoutingIds = new Set((incomeRows ?? []).map((r) => r.routing_id));
  const routingOnly = (routingRows ?? []).filter((r) => !incomeRoutingIds.has(r.id));

  return NextResponse.json({
    income: incomeSorted,
    routing_only: routingOnly,
  });
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
    .single();

  if (!routingRow) {
    return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
  }

  const { data: tourRow } = await supabase
    .from('tours')
    .select('workspace_id')
    .eq('id', routingRow.tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tourRow) {
    return NextResponse.json({ error: 'Routing not found' }, { status: 404 });
  }

  const workspaceId = tourRow.workspace_id;

  const preTaxGuarantee = Number(body.pre_tax_guarantee) || 0;
  const withholdingPct = Number(body.withholding_pct) || 0;
  const preTaxOverage = Number(body.pre_tax_overage) || 0;

  const postTaxGuarantee = postTaxFromPreTax(preTaxGuarantee, withholdingPct);
  const postTaxOverage = postTaxFromPreTax(preTaxOverage, withholdingPct);

  const payload: Record<string, unknown> = {
    routing_id,
    workspace_id: workspaceId,
    pre_tax_guarantee: preTaxGuarantee,
    withholding_pct: withholdingPct,
    post_tax_guarantee: postTaxGuarantee,
    pre_tax_overage: preTaxOverage,
    post_tax_overage: postTaxOverage,
    updated_at: new Date().toISOString(),
  };
  if (body.merch_income !== undefined) payload.merch_income = Number(body.merch_income) || 0;
  if (body.vip_income !== undefined) payload.vip_income = Number(body.vip_income) || 0;
  if (body.drop_count !== undefined) payload.drop_count = body.drop_count;
  if (body.notes !== undefined) payload.notes = body.notes;

  const { data, error } = await supabase
    .from('budget_income')
    .upsert(payload, { onConflict: 'routing_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
