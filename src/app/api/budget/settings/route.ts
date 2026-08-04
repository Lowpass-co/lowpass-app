/* ============================================
   LOWPASS — Budget Settings API

   GET: Fetch budget_settings for a tour (?tour_id=uuid).
        Auto-creates with defaults if none exist.
   POST: Create/update settings (upsert on tour_id).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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

  const { data: settings, error: fetchError } = await supabase
    .from('budget_settings')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (settings) {
    return NextResponse.json(settings);
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id, workspace_id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: created, error: insertError } = await supabase
    .from('budget_settings')
    .insert({
      tour_id: tourId,
      workspace_id: profile.workspace_id,
      currency_home: 'GBP',
      currency_tour: 'USD',
      insurance_pct: 0.03,
      contingency_pct: 0.02,
      accountancy_pct: 0,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json(created);
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

  const body = await request.json();
  const {
    tour_id,
    currency_home,
    currency_tour,
    insurance_pct,
    contingency_pct,
    accountancy_pct,
    merch_cogs_pct,
    insurance_basis,
    contingency_basis,
    accountancy_basis,
    notes,
    track_phases,
    // Phase 3 — projection defaults + config (unversioned).
    default_sell_thru,
    default_dollars_per_head,
    default_merch_fee_pct,
    overage_haircut,
    overage_tax_pct,
  } = body;

  if (!tour_id) {
    return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Stage 3 — overhead bases must be one of the known vocabulary values.
  const BASIS_VALUES = ['income_gross', 'expenses_total', 'expenses_pre_contingency'];
  const validBasis = (v: unknown) =>
    typeof v === 'string' && BASIS_VALUES.includes(v);

  const payload: Record<string, unknown> = {
    tour_id,
    workspace_id: profile.workspace_id,
    updated_at: new Date().toISOString(),
  };
  if (currency_home !== undefined) payload.currency_home = currency_home;
  if (currency_tour !== undefined) payload.currency_tour = currency_tour;
  // FX unify (Stage 2) — exchange_rate (store #3) is retired; per-currency FX
  // lives in budget_fx_rates (migration 236 drops the column).
  if (insurance_pct !== undefined) payload.insurance_pct = insurance_pct;
  if (contingency_pct !== undefined) payload.contingency_pct = contingency_pct;
  if (accountancy_pct !== undefined) payload.accountancy_pct = accountancy_pct;
  if (merch_cogs_pct !== undefined) payload.merch_cogs_pct = merch_cogs_pct;
  if (validBasis(insurance_basis)) payload.insurance_basis = insurance_basis;
  if (validBasis(contingency_basis)) payload.contingency_basis = contingency_basis;
  if (validBasis(accountancy_basis)) payload.accountancy_basis = accountancy_basis;
  if (notes !== undefined) payload.notes = notes;
  if (track_phases !== undefined) payload.track_phases = Boolean(track_phases);
  // Phase 3 — projection defaults (fractions) + config.
  if (default_sell_thru !== undefined) payload.default_sell_thru = default_sell_thru;
  if (default_dollars_per_head !== undefined) payload.default_dollars_per_head = default_dollars_per_head;
  if (default_merch_fee_pct !== undefined) payload.default_merch_fee_pct = default_merch_fee_pct;
  if (overage_haircut !== undefined) payload.overage_haircut = overage_haircut;
  if (overage_tax_pct !== undefined) payload.overage_tax_pct = overage_tax_pct;

  const { data, error } = await supabase
    .from('budget_settings')
    .upsert(payload, { onConflict: 'tour_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
