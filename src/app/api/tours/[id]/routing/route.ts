/* ============================================
   LOWPASS — Tour Routing API

   GET: List routing (?lite=1 → { routing } subset + workspace check;
        default → full rows array for editors/budget).
   POST: Upsert routing (replace all dates in range)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId } = await params;
  const { searchParams } = new URL(request.url);
  const lite = searchParams.get('lite') === '1';

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (tourErr || !tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  if (lite) {
    const { data, error } = await supabase
      .from('routing')
      .select('id, date, day_type, city, venue_name, notes')
      .eq('tour_id', tourId)
      .order('date');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ routing: data ?? [] });
  }

  const { data, error } = await supabase
    .from('routing')
    .select('*')
    .eq('tour_id', tourId)
    .order('date');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId } = await params;

  // Verify tour exists and user has access (RLS will block if not)
  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('id, start_date, end_date')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const body = await request.json();
  const rows = Array.isArray(body.dates) ? body.dates : body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'dates array is required' }, { status: 400 });
  }

  // Delete existing routing for this tour, then insert new rows
  const { error: deleteError } = await supabase
    .from('routing')
    .delete()
    .eq('tour_id', tourId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const insertRows = rows.map((r: { date: string; day_type?: string; city?: string; address?: string; venue_id?: string; venue_name?: string; venue_website?: string; venue_phone?: string; venue_capacity?: number | null; notes?: string; latitude?: number; longitude?: number; transport_to_next?: string }, i: number) => ({
    tour_id: tourId,
    date: r.date,
    day_type: r.day_type ?? '',
    city: r.city ?? '',
    address: r.address ?? '',
    venue_id: r.venue_id || null,
    venue_name: r.venue_name || null,
    venue_website: r.venue_website || null,
    venue_phone: r.venue_phone || null,
    venue_capacity: r.venue_capacity ?? null,
    notes: r.notes || null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    transport_to_next: r.transport_to_next ?? 'default',
    sequence: i,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('routing')
    .insert(insertRows)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Sprint 9 §5 — audit_log row so the Routing page's
  // "Last edit by X, Yh ago" line populates. One row per save
  // (not per row) — entity_id points at the first row of the
  // saved batch as a representative anchor; field_changes
  // carries the count + tour_id for context.
  const insertedRows = (inserted ?? []) as Array<{ id: string; tour_id: string }>;
  const anchorId = insertedRows[0]?.id ?? null;
  if (anchorId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .maybeSingle();
    const workspaceId =
      (profile as { workspace_id?: string | null } | null)?.workspace_id ?? null;
    if (workspaceId) {
      await supabase.from('audit_log').insert({
        workspace_id: workspaceId,
        actor_user_id: user.id,
        action: 'updated',
        entity_type: 'routing',
        entity_id: anchorId,
        field_changes: {
          tour_id: tourId,
          rows_saved: insertedRows.length,
        },
      });
    }
  }

  return NextResponse.json(inserted ?? []);
}
