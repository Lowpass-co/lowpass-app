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
import { resolveActualsCascade } from '@/lib/budget/actualsProvenance';

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
    // #24 — real attendance + gross box office (informational; cascade into
    // budget_income.actual_tickets_sold / actual_gross, prefer reconciled).
    day_of_tickets_sold?: number | null;
    reconciled_tickets_sold?: number | null;
    day_of_gross?: number | null;
    reconciled_gross?: number | null;
    // Stage 5 — when true, force the actuals cascade to overwrite a row whose
    // actuals_source is 'manual' (set via the settlement UI's per-row conflict
    // "overwrite" confirm). Absent/false = respect the manual provenance.
    overwrite_manual_actuals?: boolean;
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
  // #24 — real attendance + gross (informational context for income actuals).
  if (body.day_of_tickets_sold !== undefined) payload.day_of_tickets_sold = body.day_of_tickets_sold;
  if (body.reconciled_tickets_sold !== undefined) payload.reconciled_tickets_sold = body.reconciled_tickets_sold;
  if (body.day_of_gross !== undefined) payload.day_of_gross = body.day_of_gross;
  if (body.reconciled_gross !== undefined) payload.reconciled_gross = body.reconciled_gross;

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

  // Settlement → income ACTUALS (one live layer; NOT versioned). Prefer the
  // reconciled figures, fall back to day-of. VIP has no settlement source → left
  // manual (untouched). actual_deductions (Phase 1) so the P&L stops overstating
  // actual income.
  const actualGuarantee = settlement?.reconciled_guarantee ?? settlement?.day_of_guarantee ?? null;
  const actualOverage = settlement?.reconciled_overage ?? settlement?.day_of_overage ?? null;
  const actualMerch = settlement?.reconciled_merch ?? settlement?.day_of_merch ?? null;
  const actualDeductions = settlement?.reconciled_deductions ?? settlement?.day_of_deductions ?? null;
  // #24 — real attendance + gross box office cascade (informational; prefer
  // reconciled over day-of, exactly like the money figures). actual_capacity is
  // NOT a settlement figure (grid-entry only) → never written here.
  const actualTicketsSold = settlement?.reconciled_tickets_sold ?? settlement?.day_of_tickets_sold ?? null;
  const actualGross = settlement?.reconciled_gross ?? settlement?.day_of_gross ?? null;

  // Live FX (#currency 2.5) — LOCK-ON-ACTUAL. When actuals land, freeze the FX
  // rate this show's native income converts at, so realised income never drifts
  // with later market moves. Write-once: a row already locked keeps its rate.
  // Missing rate / tour-currency show → 1:1 (never 0).
  const hasActuals =
    actualGuarantee != null || actualOverage != null || actualMerch != null || actualDeductions != null;
  let lockedFxRate: number | null = null;
  if (hasActuals) {
    const { data: existing } = await supabase
      .from('budget_income')
      .select('currency, locked_fx_rate')
      .eq('routing_id', routing_id)
      .maybeSingle();
    if (existing?.locked_fx_rate != null) {
      lockedFxRate = Number(existing.locked_fx_rate); // already locked — preserve
    } else {
      const { data: routingRow } = await supabase.from('routing').select('tour_id').eq('id', routing_id).maybeSingle();
      const tourId = (routingRow as { tour_id?: string } | null)?.tour_id ?? null;
      const { data: tourRow } = tourId
        ? await supabase.from('tours').select('currency').eq('id', tourId).maybeSingle()
        : { data: null };
      const tourCcy = String((tourRow as { currency?: string } | null)?.currency ?? 'GBP').toUpperCase();
      const showCcy = String((existing as { currency?: string } | null)?.currency ?? '').toUpperCase();
      if (!showCcy || showCcy === tourCcy) {
        lockedFxRate = 1; // tour currency / unset → 1:1
      } else if (tourId) {
        const { data: fx } = await supabase
          .from('budget_fx_rates')
          .select('rate_to_tour_currency')
          .eq('tour_id', tourId)
          .eq('currency', showCcy)
          .maybeSingle();
        const r = Number((fx as { rate_to_tour_currency?: number } | null)?.rate_to_tour_currency);
        lockedFxRate = Number.isFinite(r) && r > 0 ? r : 1; // missing → 1:1, never 0
      } else {
        lockedFxRate = 1;
      }
    }
  }

  // UPSERT on routing_id — a settled show with NO income row used to silently
  // lose its actuals (update-if-exists). Create the row so actuals are never
  // dropped. (actual_vip omitted → preserved on an existing row, NULL on a new
  // one — settlement isn't a VIP source.)
  // Phase G — merge-safe upsert: OMIT any figure the settlement doesn't carry so
  // its existing (carried) value is PRESERVED, never null-stomped. Mirrors the
  // actual_vip omission + the locked_fx_rate write-when-resolved pattern below.
  // On conflict, only the provided columns are updated; on a fresh row the
  // omitted ones default to NULL (nothing to preserve).
  // Stage 5 — actuals provenance gate. The cascade writes ONLY rows whose
  // actuals_source is NULL or 'settlement'. A 'manual' row (someone typed its
  // actuals into the grid) is SKIPPED and its differing fields returned as a
  // conflict list so the settlement UI can offer a per-row explicit overwrite
  // (which re-POSTs with overwrite_manual_actuals=true). Existing invariant —
  // settlement never null-stomps — is preserved: we still omit any figure the
  // settlement doesn't carry.
  const overwriteManual = body.overwrite_manual_actuals === true;
  const { data: existingIncomeRow } = await supabase
    .from('budget_income')
    .select('actuals_source, actual_guarantee, actual_overage, actual_merch, actual_deductions, actual_tickets_sold, actual_gross')
    .eq('routing_id', routing_id)
    .maybeSingle();
  const existingRow = (existingIncomeRow ?? {}) as Record<string, number | null | string>;

  const { skip: skipCascade, conflicts, writeSource } = resolveActualsCascade({
    existingSource: (existingRow.actuals_source as string | null) ?? null,
    existingActuals: {
      actual_guarantee: existingRow.actual_guarantee as number | null,
      actual_overage: existingRow.actual_overage as number | null,
      actual_merch: existingRow.actual_merch as number | null,
      actual_deductions: existingRow.actual_deductions as number | null,
      actual_tickets_sold: existingRow.actual_tickets_sold as number | null,
      actual_gross: existingRow.actual_gross as number | null,
    },
    settlementActuals: {
      actual_guarantee: actualGuarantee,
      actual_overage: actualOverage,
      actual_merch: actualMerch,
      actual_deductions: actualDeductions,
      actual_tickets_sold: actualTicketsSold,
      actual_gross: actualGross,
    },
    hasActuals,
    overwriteManual,
  });

  if (!skipCascade) {
    const incomePayload: Record<string, unknown> = {
      routing_id,
      workspace_id: profile.workspace_id,
      updated_at: now,
    };
    if (actualGuarantee != null) incomePayload.actual_guarantee = actualGuarantee;
    if (actualOverage != null) incomePayload.actual_overage = actualOverage;
    if (actualMerch != null) incomePayload.actual_merch = actualMerch;
    if (actualDeductions != null) incomePayload.actual_deductions = actualDeductions;
    // #24 — real attendance + gross (informational; never feeds income_gross).
    if (actualTicketsSold != null) incomePayload.actual_tickets_sold = actualTicketsSold;
    if (actualGross != null) incomePayload.actual_gross = actualGross;
    // Only write locked_fx_rate when we resolved one — never clobber an existing
    // lock with null on a settlement edit that carries no actuals.
    if (lockedFxRate != null) incomePayload.locked_fx_rate = lockedFxRate;
    // Stamp provenance whenever we actually write settlement-derived actuals —
    // flips a NULL row (and a manual row being overwritten) to 'settlement'.
    if (writeSource) incomePayload.actuals_source = writeSource;

    await supabase.from('budget_income').upsert(incomePayload, { onConflict: 'routing_id' });
  }

  return NextResponse.json({
    ...settlement,
    // Non-null only when the cascade was skipped because the income row is
    // manually-owned; the UI prompts + re-POSTs with overwrite_manual_actuals.
    actuals_conflict: skipCascade ? { routing_id, conflicts } : null,
  });
}
