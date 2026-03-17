/* ============================================
   LOWPASS — AI Budget Template from History

   POST: tour_id, artist_id, workspace_id, cities[], show_count, crew_count.
   Fetches completed tours, aggregates costs, asks Claude for template JSON.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

const n = (x: number | null | undefined): number => (x == null ? 0 : Number(x) || 0);

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI template not configured' }, { status: 503 });
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

  let body: {
    tour_id: string;
    artist_id?: string;
    workspace_id: string;
    cities?: string[];
    show_count: number;
    crew_count: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id, artist_id, workspace_id, show_count, crew_count } = body;
  const cities = body.cities ?? [];
  if (!tour_id || !workspace_id) {
    return NextResponse.json({ error: 'tour_id and workspace_id required' }, { status: 400 });
  }

  const wid = profile.workspace_id;

  let pastTours: { id: string; name: string; currency: string; start_date: string | null; end_date: string | null }[] = [];

  if (artist_id) {
    const { data } = await supabase
      .from('tours')
      .select('id, name, currency, start_date, end_date')
      .eq('artist_id', artist_id)
      .eq('workspace_id', wid)
      .eq('status', 'completed')
      .order('end_date', { ascending: false })
      .limit(5);
    pastTours = data ?? [];
  }

  if (pastTours.length === 0) {
    const { data } = await supabase
      .from('tours')
      .select('id, name, currency, start_date, end_date')
      .eq('workspace_id', wid)
      .eq('status', 'completed')
      .order('end_date', { ascending: false })
      .limit(5);
    pastTours = data ?? [];
  }

  const tourIds = pastTours.map((t) => t.id);
  if (tourIds.length === 0) {
    return NextResponse.json({
      summary: 'No completed tours found. Add line items manually or complete a tour first.',
      line_items: [],
      estimated_total_expenses: 0,
      confidence: 'low',
      warnings: ['No historical data available.'],
    });
  }

  const [
    routingRes,
    lineItemsRes,
    hotelBookingsRes,
    flightRes,
    personnelRes,
  ] = await Promise.all([
    supabase.from('routing').select('tour_id, day_type').in('tour_id', tourIds),
    supabase.from('budget_line_items').select('tour_id, category, actual_cost, proposed_cost').in('tour_id', tourIds),
    supabase.from('hotel_bookings').select('id, tour_id').in('tour_id', tourIds),
    supabase.from('flight_bookings').select('tour_id, actual_cost, proposed_cost').in('tour_id', tourIds),
    supabase.from('personnel_rates').select('tour_id, show_rate, off_rate, per_diem, person_type').in('tour_id', tourIds),
  ]);

  const routing = routingRes.data ?? [];
  const lineItems = lineItemsRes.data ?? [];
  const hotelBookings = hotelBookingsRes.data ?? [];
  const flightBookings = flightRes.data ?? [];
  const personnel = personnelRes.data ?? [];

  const hotelBookingIds = hotelBookings.map((h: { id: string }) => h.id);
  let assignments: { hotel_booking_id: string; rate_per_night: number; nights: number }[] = [];
  if (hotelBookingIds.length > 0) {
    const { data: assign } = await supabase
      .from('hotel_room_assignments')
      .select('hotel_booking_id, rate_per_night, nights')
      .in('hotel_booking_id', hotelBookingIds);
    assignments = assign ?? [];
  }

  const showDaysByTour = new Map<string, number>();
  for (const r of routing) {
    const tid = (r as { tour_id: string }).tour_id;
    if (!showDaysByTour.has(tid)) showDaysByTour.set(tid, 0);
    if ((r as { day_type: string }).day_type === 'show' || (r as { day_type: string }).day_type === 'festival') {
      showDaysByTour.set(tid, showDaysByTour.get(tid)! + 1);
    }
  }

  let totalShowDays = 0;
  showDaysByTour.forEach((d) => { totalShowDays += d; });

  const sumByCategory = new Map<string, number>();
  for (const i of lineItems) {
    const cat = (i as { category: string }).category;
    const cost = n((i as { actual_cost?: number }).actual_cost) || n((i as { proposed_cost?: number }).proposed_cost);
    sumByCategory.set(cat, (sumByCategory.get(cat) ?? 0) + cost);
  }

  const totalLineItems = Array.from(sumByCategory.values()).reduce((a, b) => a + b, 0);
  const hotelTotal = assignments.reduce((a, x) => a + n(x.rate_per_night) * n(x.nights), 0);
  const flightTotal = flightBookings.reduce((a, x) => a + (n((x as { actual_cost?: number }).actual_cost) || n((x as { proposed_cost?: number }).proposed_cost)), 0);
  const transportTotal = Array.from(sumByCategory.entries())
    .filter(([c]) => c.startsWith('transport_'))
    .reduce((a, [, v]) => a + v, 0);
  const prodTotal = Array.from(sumByCategory.entries())
    .filter(([c]) => c.startsWith('prod_'))
    .reduce((a, [, v]) => a + v, 0);
  const perDiemTotal = personnel.reduce((a, p) => {
    const days = totalShowDays || 1;
    return a + n((p as { per_diem: number }).per_diem) * days;
  }, 0);
  const personCount = personnel.length || 1;

  const avgHotelPerDay = totalShowDays > 0 ? hotelTotal / totalShowDays : 0;
  const avgFlightPerPerson = personCount > 0 ? flightTotal / personCount : 0;
  const avgTransportPerDay = totalShowDays > 0 ? transportTotal / totalShowDays : 0;
  const avgProductionPerDay = totalShowDays > 0 ? prodTotal / totalShowDays : 0;
  const avgPerDiem = personCount > 0 && totalShowDays > 0 ? perDiemTotal / (personCount * totalShowDays) : 0;

  const client = new Anthropic({ apiKey });

  const citiesText = cities.length > 0 ? cities.join(', ') : 'various';

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Based on historical tour data for this artist/workspace, generate a budget template.

Historical averages (from ${pastTours.length} completed tour(s), ${totalShowDays} total show days):
- Hotels: £${avgHotelPerDay.toFixed(0)}/show day
- Flights: £${avgFlightPerPerson.toFixed(0)}/person
- Transport: £${avgTransportPerDay.toFixed(0)}/show day
- Production: £${avgProductionPerDay.toFixed(0)}/show day
- Per diem: £${avgPerDiem.toFixed(2)}/person/day

New tour parameters:
- ${show_count} shows across ${citiesText}
- ${crew_count} crew members

Return ONLY valid JSON with this structure (no markdown):
{
  "summary": "Brief natural language description of the budget estimate",
  "line_items": [
    { "category": "prod_misc or transport_misc or hotels etc", "label": "Short label", "proposed_cost": number, "routing_id": null, "reasoning": "Optional one line" }
  ],
  "estimated_total_expenses": number,
  "confidence": "low|medium|high",
  "warnings": ["any concerns or caveats"]
}
Use category values: hotels, prod_misc, prod_audio, transport_misc, transport_bus, etc. Keep line_items to 5-15 items.`,
        },
      ],
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse template' }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      ...parsed,
      _meta: { past_tour_count: pastTours.length },
    });
  } catch (err) {
    console.error('AI template error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Template generation failed' },
      { status: 500 }
    );
  }
}
