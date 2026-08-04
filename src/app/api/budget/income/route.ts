/* ============================================
   LOWPASS — Budget Income API

   GET: All budget_income for a tour's routing (?tour_id=uuid),
        joined with routing; also routing dates with no income row.
   POST: Create/update budget_income (upsert on routing_id).
        Auto-computes post_tax_guarantee and post_tax_overage per math spec.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadTourIncome } from '@/lib/budget/income';
import { resolveLockState, resolveActiveVersion } from '@/server/budget/versions';
import { projectIncome, type DealType } from '@/lib/budget/incomeProjection';
import { seedActualGuarantee } from '@/lib/budget/seedActualGuarantee';

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
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
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
    // #28 — per-output manual override flags. When true the route stops
    // recomputing that output from the inputs and keeps the hand-entered value.
    overage_is_override?: boolean;
    merch_is_override?: boolean;
    vip_is_override?: boolean;
    // Phase 3 — projection inputs (proposed). The engine materialises the value
    // columns above from these (deal-aware, VS only).
    capacity?: number | null;
    est_sell_thru?: number | null;
    face_value?: number | null;
    deal_type?: string | null;
    deal_pct?: number | null;
    deal_threshold?: number | null;
    deal_pct_above?: number | null;
    dollars_per_head?: number | null;
    merch_fee_pct?: number | null;
    vip_tickets?: number | null;
    vip_price?: number | null;
    currency?: string | null;
    actual_guarantee?: number | null;
    actual_overage?: number | null;
    actual_merch?: number | null;
    actual_vip?: number | null;
    // #24 — real attendance + gross + settled cap (informational ACTUAL context;
    // these NEVER feed income_gross / the recompute / the projected outputs).
    actual_tickets_sold?: number | null;
    actual_gross?: number | null;
    actual_capacity?: number | null;
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

  // Lock guard — a write touching PROPOSED income (pre_tax_*, withholding_pct,
  // merch, vip) on a tour whose active version is approved → 423. Actual-only
  // (actual_*) writes pass (settlement-fed actuals are the live layer).
  const PROPOSED_INCOME = [
    'pre_tax_guarantee', 'withholding_pct', 'pre_tax_overage', 'merch_income', 'vip_income', 'currency',
    // Phase 3 — projection inputs are proposed structure → versioned + lock-guarded.
    'capacity', 'est_sell_thru', 'face_value', 'deal_type', 'deal_pct', 'deal_threshold',
    'deal_pct_above', 'dollars_per_head', 'merch_fee_pct', 'vip_tickets', 'vip_price',
    // #28 — setting/clearing an override is a proposed change → lock-guarded too.
    'overage_is_override', 'merch_is_override', 'vip_is_override',
  ];
  if (PROPOSED_INCOME.some((k) => (body as Record<string, unknown>)[k] !== undefined)) {
    const { locked, version } = await resolveLockState(supabase, routingRow.tour_id as string, workspaceId);
    if (locked) {
      return NextResponse.json(
        { error: 'This budget is approved & locked.', code: 'VERSION_LOCKED', versionId: version?.id ?? null },
        { status: 423 },
      );
    }
  }

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
  // Phase 2 — per-show currency (proposed structure → versioned). '' / null clears
  // to the tour currency.
  const bodyCurrency = (body as { currency?: string | null }).currency;
  const currencyVal =
    bodyCurrency !== undefined
      ? (bodyCurrency ? String(bodyCurrency).toUpperCase() : null)
      : ((existing?.currency as string | null) ?? null);

  // ── Phase 3 — merge the projection inputs (proposed). ──
  const dealType =
    body.deal_type !== undefined
      ? (body.deal_type ? String(body.deal_type).toUpperCase() : null)
      : ((existing?.deal_type as string | null) ?? null);
  const capacity = nullableMerge(body.capacity, existing?.capacity);
  const estSellThru = nullableMerge(body.est_sell_thru, existing?.est_sell_thru);
  const faceValue = nullableMerge(body.face_value, existing?.face_value);
  const dealPct = nullableMerge(body.deal_pct, existing?.deal_pct);
  const dealThreshold = nullableMerge(body.deal_threshold, existing?.deal_threshold);
  const dealPctAbove = nullableMerge(body.deal_pct_above, existing?.deal_pct_above);
  const dollarsPerHead = nullableMerge(body.dollars_per_head, existing?.dollars_per_head);
  const merchFeePct = nullableMerge(body.merch_fee_pct, existing?.merch_fee_pct);
  const vipTickets = nullableMerge(body.vip_tickets, existing?.vip_tickets);
  const vipPrice = nullableMerge(body.vip_price, existing?.vip_price);

  // Output value columns — start from the merged value, then let the engine
  // materialise them when a projection INPUT changed.
  //
  // PROJECTION-FIX: the outputs are COMPUTED BY DEFAULT. We recompute whenever an
  // input changes — regardless of whether the body also carries the output. The
  // old gate (`&& body.pre_tax_overage === undefined`) made a stray 0 in
  // pre_tax_overage read as a manual override and silently froze the formula
  // (Adam's bug). The grid now renders the outputs read-only (computed-locked), so
  // they're never hand-typed here; a deliberate override is a separate feature (#28).
  let preTaxOverage = numMerge(body.pre_tax_overage, existing?.pre_tax_overage);
  let merchIncome = numMerge(body.merch_income, existing?.merch_income);
  let vipIncome = numMerge(body.vip_income, existing?.vip_income);

  // #28 — per-output override flags (merge: body wins, else keep existing). When
  // set, the matching output is HAND-ENTERED and the engine must not recompute it.
  const boolMerge = (b: boolean | undefined, ex: unknown): boolean =>
    b !== undefined ? !!b : !!ex;
  const overageIsOverride = boolMerge(body.overage_is_override, existing?.overage_is_override);
  const merchIsOverride = boolMerge(body.merch_is_override, existing?.merch_is_override);
  const vipIsOverride = boolMerge(body.vip_is_override, existing?.vip_is_override);

  const bodyKeys = Object.keys(body);
  const has = (keys: string[]) => keys.some((k) => bodyKeys.includes(k));
  const OVERAGE_INPUTS = ['capacity', 'est_sell_thru', 'face_value', 'deal_type', 'deal_pct', 'deal_threshold', 'deal_pct_above', 'withholding_pct', 'pre_tax_guarantee'];
  const MERCH_INPUTS = ['capacity', 'est_sell_thru', 'dollars_per_head', 'merch_fee_pct'];
  const VIP_INPUTS = ['vip_tickets', 'vip_price'];
  // Recompute when an input changed OR the override was just CLEARED (refill from
  // the engine immediately) — but NEVER while the override is set (the gate is the
  // explicit flag, so a stray 0 can't freeze the formula: an unset flag recomputes).
  const recomputeOverage = !overageIsOverride && (has(OVERAGE_INPUTS) || body.overage_is_override === false);
  const recomputeMerch = !merchIsOverride && (has(MERCH_INPUTS) || body.merch_is_override === false);
  const recomputeVip = !vipIsOverride && (has(VIP_INPUTS) || body.vip_is_override === false);

  if (recomputeOverage || recomputeMerch || recomputeVip) {
    // Per-tour defaults + config (UNVERSIONED) feed the engine; per-show inputs
    // fall back to them when null. Normalise the 0–100 stored %s to fractions.
    const { data: cfg } = await supabase
      .from('budget_settings')
      .select('default_sell_thru, default_dollars_per_head, default_merch_fee_pct, overage_haircut, overage_tax_pct')
      .eq('tour_id', routingRow.tour_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
    const sellThru = estSellThru != null ? Number(estSellThru) / 100 : numOrNull(cfg?.default_sell_thru);
    const perHead = dollarsPerHead != null ? Number(dollarsPerHead) : numOrNull(cfg?.default_dollars_per_head);
    const feeFrac = merchFeePct != null ? Number(merchFeePct) / 100 : numOrNull(cfg?.default_merch_fee_pct);

    const out = projectIncome(
      {
        capacity: numOrNull(capacity),
        sellThru,
        faceValue: numOrNull(faceValue),
        dealType: (dealType as DealType | null),
        dealPct: dealPct != null ? Number(dealPct) / 100 : null,
        dealThreshold: numOrNull(dealThreshold),
        dealPctAbove: dealPctAbove != null ? Number(dealPctAbove) / 100 : null,
        dollarsPerHead: perHead,
        merchFeePct: feeFrac,
        vipTickets: numOrNull(vipTickets),
        vipPrice: numOrNull(vipPrice),
        preTaxGuarantee,
      },
      {
        haircut: cfg?.overage_haircut != null ? Number(cfg.overage_haircut) : 0.65,
        taxPct: cfg?.overage_tax_pct != null ? Number(cfg.overage_tax_pct) : 0.08,
      },
    );
    // The engine writes a PRE-withholding overage; post_tax_overage (below)
    // applies WH — exactly once. The engine returns null for PLUS / FLAT / no-deal
    // / insufficient inputs → we CLEAR the output to 0 (not leave it stale), so a
    // former-VS overage can't leak into the P&L after the deal type changes. The
    // grid then shows a blank "—" (not £0) via its own computability check; a
    // computed 0 (VS where the guarantee beats the %) stays £0.
    if (recomputeOverage) preTaxOverage = out.preTaxOverage ?? 0;
    if (recomputeMerch) merchIncome = out.merchIncome ?? 0;
    if (recomputeVip) vipIncome = out.vipIncome ?? 0;
  }

  const payload: Record<string, unknown> = {
    routing_id,
    workspace_id: workspaceId,
    pre_tax_guarantee: preTaxGuarantee,
    withholding_pct: withholdingPct,
    post_tax_guarantee: postTaxFromPreTax(preTaxGuarantee, withholdingPct),
    pre_tax_overage: preTaxOverage,
    post_tax_overage: postTaxFromPreTax(preTaxOverage, withholdingPct),
    merch_income: merchIncome,
    vip_income: vipIncome,
    // #28 — persist the override flags (the value lives in the columns above).
    overage_is_override: overageIsOverride,
    merch_is_override: merchIsOverride,
    vip_is_override: vipIsOverride,
    currency: currencyVal,
    // Phase 3 — projection inputs.
    capacity, est_sell_thru: estSellThru, face_value: faceValue, deal_type: dealType,
    deal_pct: dealPct, deal_threshold: dealThreshold, deal_pct_above: dealPctAbove,
    dollars_per_head: dollarsPerHead, merch_fee_pct: merchFeePct,
    vip_tickets: vipTickets, vip_price: vipPrice,
    // #4 — first-time seed: the settled Actual guarantee pre-fills from the
    // projected (pre-tax) guarantee so settlement starts from the deal number.
    // Never overwrites an actual already present (conservative — see helper).
    actual_guarantee: seedActualGuarantee({
      merged: nullableMerge(body.actual_guarantee, existing?.actual_guarantee),
      bodyEntered: body.actual_guarantee !== undefined,
      existing: (existing?.actual_guarantee as number | null) ?? null,
      projected: preTaxGuarantee,
    }),
    actual_overage: nullableMerge(body.actual_overage, existing?.actual_overage),
    actual_merch: nullableMerge(body.actual_merch, existing?.actual_merch),
    actual_vip: nullableMerge(body.actual_vip, existing?.actual_vip),
    // #24 — real attendance + gross + settled cap (actual-only, informational).
    actual_tickets_sold: nullableMerge(body.actual_tickets_sold, existing?.actual_tickets_sold),
    actual_gross: nullableMerge(body.actual_gross, existing?.actual_gross),
    actual_capacity: nullableMerge(body.actual_capacity, existing?.actual_capacity),
    drop_count:
      body.drop_count !== undefined ? body.drop_count : (existing?.drop_count ?? null),
    notes: body.notes !== undefined ? body.notes : (existing?.notes ?? null),
    updated_at: new Date().toISOString(),
  };

  // Stage 5 — actuals provenance. An explicit manual edit to any ACTUAL field
  // marks the row 'manual', so the settlement cascade won't clobber it (it only
  // writes NULL / 'settlement' rows). Proposed-only edits — which re-merge the
  // existing actuals unchanged — and the seedActualGuarantee pre-fill do NOT
  // count: we key off the body carrying the field, not the merged value.
  const MANUAL_ACTUAL_FIELDS = [
    'actual_guarantee', 'actual_overage', 'actual_merch', 'actual_vip',
    'actual_tickets_sold', 'actual_gross', 'actual_capacity',
  ];
  if (MANUAL_ACTUAL_FIELDS.some((k) => (body as Record<string, unknown>)[k] !== undefined)) {
    payload.actuals_source = 'manual';
  }

  const { data, error } = await supabase
    .from('budget_income')
    .upsert(payload, { onConflict: 'routing_id' })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Write-through: mirror the proposed income into the active DRAFT's snapshot.
  const active = await resolveActiveVersion(supabase, routingRow.tour_id as string, workspaceId);
  if (active?.status === 'draft') {
    await supabase.from('budget_version_income').upsert(
      {
        version_id: active.id, routing_id, workspace_id: workspaceId,
        pre_tax_guarantee: preTaxGuarantee, withholding_pct: withholdingPct, pre_tax_overage: preTaxOverage,
        merch_income: merchIncome, vip_income: vipIncome,
        // #28 — mirror the override flags into the draft snapshot (lock with it).
        overage_is_override: overageIsOverride, merch_is_override: merchIsOverride, vip_is_override: vipIsOverride,
        currency: currencyVal,
        // Phase 3 — mirror the projection inputs (versioning tax).
        capacity, est_sell_thru: estSellThru, face_value: faceValue, deal_type: dealType,
        deal_pct: dealPct, deal_threshold: dealThreshold, deal_pct_above: dealPctAbove,
        dollars_per_head: dollarsPerHead, merch_fee_pct: merchFeePct,
        vip_tickets: vipTickets, vip_price: vipPrice,
      },
      { onConflict: 'version_id,routing_id' },
    );
  }
  return NextResponse.json(data);
}
