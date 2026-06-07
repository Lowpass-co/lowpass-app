import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { jsonError } from '@/lib/http/errors';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  const query = searchParams.get('q')?.trim() ?? '';
  const limit = Number(searchParams.get('limit') ?? '50');

  let dbQuery = supabase
    .from('flights')
    .select('*')
    .order('depart_at', { ascending: true })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50);

  if (tourId) dbQuery = dbQuery.eq('tour_id', tourId);
  if (query) {
    dbQuery = dbQuery.or(
      `airline.ilike.%${query}%,flight_number.ilike.%${query}%,origin_airport.ilike.%${query}%,destination_airport.ilike.%${query}%,pnr.ilike.%${query}%`
    );
  }

  const { data, error } = await dbQuery;

  if (error) return jsonError('flights.list', error);
  return NextResponse.json({ flights: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  // Security audit §M1 — whitelist writable columns instead of spreading
  // the raw body (which allowed mass-assignment of id/created_at/etc.), and
  // ALWAYS force workspace_id to the caller's own workspace. Cross-tenant
  // writes were already blocked by the flights_insert RLS WITH CHECK, but
  // trusting body.workspace_id + ...body was a defense-in-depth failure.
  const WRITABLE = [
    'tour_id', 'show_id', 'airline', 'flight_number', 'pnr',
    'origin_airport', 'destination_airport', 'depart_at', 'arrive_at',
    'cost_amount', 'cost_currency', 'passenger_ids', 'notes',
  ] as const;
  const insertRow: Record<string, unknown> = {};
  for (const k of WRITABLE) {
    if (k in body) insertRow[k] = body[k];
  }
  insertRow.workspace_id = profile.workspace_id; // never from body
  insertRow.created_by = user.id;
  insertRow.updated_by = user.id;

  const { data, error } = await supabase
    .from('flights')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) return jsonError('flights.create', error);
  return NextResponse.json(data);
}
