/* ============================================
   LOWPASS — Budget Settlement API

   GET: Settlements for a tour's shows (?tour_id=uuid).
        Show/festival routing only; join routing; include shows without settlement.
        Order by routing.date.
   POST: Create/update settlement (upsert on routing_id).
        Auto-compute day_of_net and reconciled_net (math spec §12).
        If status = 'reconciled', set reconciled_at. Sync actuals to budget_income (§12).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

function dayOfNet(
  guarantee: number | null | undefined,
  overage: number | null | undefined,
  merch: number | null | undefined,
  deductions: number | null | undefined
): number | null {
  if (guarantee == null && overage == null && merch == null && deductions == null) return null;
  const g = Number(guarantee) || 0;
  const o = Number(overage) || 0;
  const m = Number(merch) || 0;
  const d = Number(deductions) || 0;
  return g + o + m - d;
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

  const { data: showRouting, error: routingError } = await supabase
    .from('routing')
    .select('id, date, venue_name, city')
    .eq('tour_id', tourId)
    .in('day_type', ['show', 'festival'])
    .order('date', { ascending: true });

  if (routingError) {
    return NextResponse.json({ error: routingError.message }, { status: 500 });
  }

  const routingList = showRouting ?? [];
  const routingIds = routingList.map((r) => r.id);

  if (routingIds.length === 0) {
    return NextResponse.json({ settlements: [], routing_without_settlement: routingList });
  }

  const { data: settlementRows, error: settlementError } = await supabase
    .from('settlement')
    .select('*, routing(date, venue_name, city)')
    .in('routing_id', routingIds)
    .eq('workspace_id', profile.workspace_id);

  if (settlementError) {
    return NextResponse.json({ error: settlementError.message }, { status: 500 });
  }

  const settlements = (settlementRows ?? []).map((s) => ({
    ...s,
    routing: Array.isArray(s.routing) ? s.routing[0] : s.routing,
  }));
  settlements.sort((a, b) => {
    const dateA = (a.routing as { date?: string })?.date ?? '';
    const dateB = (b.routing as { date?: string })?.date ?? '';
    return dateA.localeCompare(dateB);
  });

  const settledRoutingIds = new Set(settlements.map((s) => s.routing_id));
  const routingWithoutSettlement = routingList.filter((r) => !settledRoutingIds.has(r.id));

  return NextResponse.json({
    settlements,
    routing_without_settlement: routingWithoutSettlement,
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
    status?: string;
    day_of_guarantee?: number | null;
    day_of_overage?: number | null;
    day_of_merch?: number | null;
    day_of_deductions?: number | null;
    day_of_net?: number | null;
    day_of_signed_by?: string | null;
    day_of_notes?: string | null;
    day_of_file_url?: string | null;
    reconciled_guarantee?: number | null;
    reconciled_overage?: number | null;
    reconciled_merch?: number | null;
    reconciled_deductions?: number | null;
    reconciled_net?: number | null;
    reconciled_notes?: string | null;
    deal_memo_text?: string | null;
    deal_memo_file_url?: string | null;
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

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', routingRow.tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const dayOfGuarantee = body.day_of_guarantee;
  const dayOfOverage = body.day_of_overage;
  const dayOfMerch = body.day_of_merch;
  const dayOfDeductions = body.day_of_deductions;
  const reconciledGuarantee = body.reconciled_guarantee;
  const reconciledOverage = body.reconciled_overage;
  const reconciledMerch = body.reconciled_merch;
  const reconciledDeductions = body.reconciled_deductions;

  const computedDayOfNet =
    dayOfGuarantee != null || dayOfOverage != null || dayOfMerch != null || dayOfDeductions != null
      ? dayOfNet(dayOfGuarantee, dayOfOverage, dayOfMerch, dayOfDeductions)
      : undefined;
  const computedReconciledNet =
    reconciledGuarantee != null ||
    reconciledOverage != null ||
    reconciledMerch != null ||
    reconciledDeductions != null
      ? dayOfNet(reconciledGuarantee, reconciledOverage, reconciledMerch, reconciledDeductions)
      : undefined;

  const status = body.status ?? 'pending';
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    routing_id,
    workspace_id: profile.workspace_id,
    status,
    updated_at: now,
  };
  if (body.day_of_guarantee !== undefined) payload.day_of_guarantee = body.day_of_guarantee;
  if (body.day_of_overage !== undefined) payload.day_of_overage = body.day_of_overage;
  if (body.day_of_merch !== undefined) payload.day_of_merch = body.day_of_merch;
  if (body.day_of_deductions !== undefined) payload.day_of_deductions = body.day_of_deductions;
  if (computedDayOfNet !== undefined) payload.day_of_net = computedDayOfNet;
  if (body.day_of_signed_by !== undefined) payload.day_of_signed_by = body.day_of_signed_by;
  if (body.day_of_notes !== undefined) payload.day_of_notes = body.day_of_notes;
  if (body.day_of_file_url !== undefined) payload.day_of_file_url = body.day_of_file_url;
  if (body.reconciled_guarantee !== undefined) payload.reconciled_guarantee = body.reconciled_guarantee;
  if (body.reconciled_overage !== undefined) payload.reconciled_overage = body.reconciled_overage;
  if (body.reconciled_merch !== undefined) payload.reconciled_merch = body.reconciled_merch;
  if (body.reconciled_deductions !== undefined) payload.reconciled_deductions = body.reconciled_deductions;
  if (computedReconciledNet !== undefined) payload.reconciled_net = computedReconciledNet;
  if (body.reconciled_notes !== undefined) payload.reconciled_notes = body.reconciled_notes;
  if (body.deal_memo_text !== undefined) payload.deal_memo_text = body.deal_memo_text;
  if (body.deal_memo_file_url !== undefined) payload.deal_memo_file_url = body.deal_memo_file_url;

  if (status === 'reconciled') {
    payload.reconciled_at = now;
  }

  const { data: settlement, error: upsertError } = await supabase
    .from('settlement')
    .upsert(payload, { onConflict: 'routing_id' })
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const actualGuarantee = settlement?.reconciled_guarantee ?? settlement?.day_of_guarantee ?? null;
  const actualOverage = settlement?.reconciled_overage ?? settlement?.day_of_overage ?? null;
  const actualMerch = settlement?.reconciled_merch ?? settlement?.day_of_merch ?? null;

  const { data: incomeRow } = await supabase
    .from('budget_income')
    .select('id')
    .eq('routing_id', routing_id)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (incomeRow) {
    await supabase
      .from('budget_income')
      .update({
        actual_guarantee: actualGuarantee,
        actual_overage: actualOverage,
        actual_merch: actualMerch,
        updated_at: now,
      })
      .eq('id', incomeRow.id)
      .eq('workspace_id', profile.workspace_id);
  }

  return NextResponse.json(settlement);
}
