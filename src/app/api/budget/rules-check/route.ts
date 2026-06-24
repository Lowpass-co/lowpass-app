/* ============================================
   LOWPASS — Budget rules check (deterministic, no AI)

   POST { tour_id } → { findings: BudgetFinding[] }

   Pulls routing + line items, builds the BudgetRulesInput, and returns
   the findings from the pure src/lib/budget/rules.ts engine. No
   Anthropic call, no withAiUsage — this is free and deterministic.
   Workspace-gated like budget/ai/suggest.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runBudgetRules, type BudgetRuleLineItem } from '@/lib/budget/rules';

/** Tour continents that imply cross-border (carnet-relevant) EU shows. */
const EU_CONTINENTS = new Set(['EU', 'Europe']);

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  let body: { tour_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tourId = body.tour_id;
  if (!tourId) {
    return NextResponse.json({ error: 'tour_id required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id, continent')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: routing } = await supabase
    .from('routing')
    .select('day_type, venue_id')
    .eq('tour_id', tourId);

  const showCount = (routing ?? []).filter(
    (r: { day_type: string }) => r.day_type === 'show' || r.day_type === 'festival',
  ).length;

  const { data: lineItemRows } = await supabase
    .from('budget_line_items')
    .select('category, label, proposed_cost')
    .eq('tour_id', tourId)
    .eq('workspace_id', profile.workspace_id);

  const lineItems: BudgetRuleLineItem[] = lineItemRows ?? [];

  // Largest linked venue capacity (best-effort; routing.venue_id is a
  // nullable FK so many tours won't have any). Undefined → the
  // large-room rule stays silent.
  const venueIds = Array.from(
    new Set((routing ?? []).map((r: { venue_id: string | null }) => r.venue_id).filter(Boolean)),
  ) as string[];
  let maxVenueCapacity: number | undefined;
  if (venueIds.length > 0) {
    const { data: venues } = await supabase
      .from('venues')
      .select('capacity')
      .eq('workspace_id', profile.workspace_id)
      .in('id', venueIds);
    const caps = (venues ?? [])
      .map((v: { capacity: number | null }) => v.capacity)
      .filter((c): c is number => typeof c === 'number' && Number.isFinite(c));
    if (caps.length > 0) maxVenueCapacity = Math.max(...caps);
  }

  const findings = runBudgetRules({
    showCount,
    hasEuShows: EU_CONTINENTS.has((tour as { continent?: string }).continent ?? ''),
    lineItems,
    maxVenueCapacity,
  });

  return NextResponse.json({ findings });
}
