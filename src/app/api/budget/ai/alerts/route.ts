/* ============================================
   LOWPASS — AI Budget Variance Alerts

   GET ?tour_id= — Analyse budget data, return AI-generated alerts (JSON array).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

const n = (x: number | null | undefined): number => (x == null ? 0 : Number(x) || 0);

export async function GET(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Alerts not configured' }, { status: 503 });
  }

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
    return NextResponse.json({ error: 'tour_id required' }, { status: 400 });
  }

  const wid = profile.workspace_id;

  const [
    summaryRes,
    lineItemsRes,
    routingRes,
    flightsRes,
    hotelsRes,
    settingsRes,
  ] = await Promise.all([
    fetch(new URL(`/api/budget/summary?tour_id=${tourId}`, request.url).toString(), {
      headers: { cookie: request.headers.get('cookie') ?? '' },
    }).then((r) => r.json().catch(() => null)),
    supabase.from('budget_line_items').select('category, proposed_cost, actual_cost, routing_id').eq('tour_id', tourId).eq('workspace_id', wid),
    supabase.from('routing').select('id, day_type').eq('tour_id', tourId),
    supabase.from('flight_bookings').select('proposed_cost, actual_cost').eq('tour_id', tourId).eq('workspace_id', wid),
    supabase.from('hotel_bookings').select('id').eq('tour_id', tourId).eq('workspace_id', wid),
    supabase.from('budget_settings').select('*').eq('tour_id', tourId).maybeSingle(),
  ]);

  const summary = summaryRes && !summaryRes.error ? summaryRes : null;
  const lineItems = lineItemsRes.data ?? [];
  const routing = routingRes.data ?? [];
  const flights = flightsRes.data ?? [];
  const hotelIds = (hotelsRes.data ?? []).map((h: { id: string }) => h.id);

  let assignments: { rate_per_night: number }[] = [];
  if (hotelIds.length > 0) {
    const { data: a } = await supabase
      .from('hotel_room_assignments')
      .select('rate_per_night')
      .in('hotel_booking_id', hotelIds);
    assignments = a ?? [];
  }

  const incomeSection = summary?.sections?.find((s: { title: string }) => s.title === 'INCOME');
  const totalsSection = summary?.sections?.find((s: { title: string }) => s.title === 'TOTALS');
  const totalIncomeProposed = incomeSection?.subtotal?.proposed ?? 0;
  const totalExpensesProposed = totalsSection?.lines?.[0]?.proposed ?? 0;
  const totalExpensesActual = totalsSection?.lines?.[0]?.actual ?? 0;

  const categoriesWithActuals = Array.from(
    new Set(
      lineItems
        .filter((i: { actual_cost?: number }) => n((i as { actual_cost?: number }).actual_cost) > 0)
        .map((i: { category: string }) => (i as { category: string }).category)
    )
  );

  const varianceByCategory: Record<string, { proposed: number; actual: number }> = {};
  for (const i of lineItems) {
    const cat = (i as { category: string }).category;
    if (!varianceByCategory[cat]) varianceByCategory[cat] = { proposed: 0, actual: 0 };
    varianceByCategory[cat].proposed += n((i as { proposed_cost?: number }).proposed_cost);
    varianceByCategory[cat].actual += n((i as { actual_cost?: number }).actual_cost);
  }

  const showDays = routing.filter((r: { day_type: string }) => r.day_type === 'show' || r.day_type === 'festival').length;
  const routingIds = new Set(routing.map((r: { id: string }) => (r as { id: string }).id));
  const lineItemsByRouting = new Map<string, number>();
  for (const i of lineItems) {
    const rid = (i as { routing_id?: string }).routing_id;
    if (rid && (i as { category: string }).category.startsWith('transport')) {
      lineItemsByRouting.set(rid, (lineItemsByRouting.get(rid) ?? 0) + 1);
    }
  }
  const showDaysWithoutTransport = routing
    .filter((r: { day_type: string; id: string }) => (r.day_type === 'show' || r.day_type === 'festival') && !lineItemsByRouting.has((r as { id: string }).id))
    .length;

  const flightCosts = flights.map((f: { proposed_cost?: number; actual_cost?: number }) => n(f.actual_cost) || n(f.proposed_cost)).filter(Boolean);
  const minFlight = flightCosts.length ? Math.min(...flightCosts) : 0;
  const maxFlight = flightCosts.length ? Math.max(...flightCosts) : 0;

  const withholdingInfo = 'See income rows for withholding';

  const budgetContext = `
Tour budget analysis. Data:
- Total income (proposed): £${totalIncomeProposed.toFixed(0)}
- Total expenses (proposed): £${totalExpensesProposed.toFixed(0)}, (actual): £${totalExpensesActual.toFixed(0)}
- Categories with actuals entered: ${categoriesWithActuals.join(', ') || 'none'}
- Variance by category: ${JSON.stringify(varianceByCategory)}
- Show days: ${showDays}. Show days without transport costs: ${showDaysWithoutTransport}
- Flight cost range: £${minFlight.toFixed(0)} to £${maxFlight.toFixed(0)} per booking
- Withholding/tax info: ${withholdingInfo}
`;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${budgetContext}

Analyse this tour budget and return a JSON array of alerts. Each alert:
{
  "severity": "info|warning|critical",
  "category": "hotels|flights|transport|production|income|overheads|general",
  "message": "Brief, specific, actionable message",
  "detail": "Optional longer explanation"
}

Focus on: cost anomalies, missing data, category imbalances, withholding tax issues. Return 3-8 alerts, ordered by severity (critical first). Return ONLY the JSON array, no markdown.`,
        },
      ],
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ alerts: [] });
    }

    const alerts = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ alerts: Array.isArray(alerts) ? alerts : [] });
  } catch (err) {
    console.error('AI alerts error:', err);
    return NextResponse.json({ alerts: [] });
  }
}
