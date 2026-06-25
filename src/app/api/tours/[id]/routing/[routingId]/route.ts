/* ============================================
   LOWPASS — Tour Routing Row (PATCH)

   Partial update for a single routing row. Whitelisted fields only.
   Verifies workspace → tour → routing ownership before writing.
   Last-write-wins (no optimistic concurrency in v1).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { findOrCreateCanonicalVenue } from '@/lib/venues/canonical';

/**
 * Fields callers are allowed to PATCH on a routing row.
 * Do NOT add fields like `tour_id`, `id`, `created_at`, or anything that
 * changes row identity. Add one field at a time and confirm the frontend
 * actually sends it before expanding.
 */
const ALLOWED_FIELDS = new Set<string>([
  'notes',
  'day_type',
  'city',
  'address',
  'venue_id',
  'venue_name',
  'venue_website',
  'venue_phone',
  'venue_capacity',
  'latitude',
  'longitude',
  'transport_to_next',
  'canonical_venue_id',
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; routingId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId, routingId } = await params;

  // 1. workspace check
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  // 2. tour must belong to workspace
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (tourErr || !tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // 3. routing row must belong to tour
  const { data: existing, error: existingErr } = await supabase
    .from('routing')
    .select('id')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .maybeSingle();

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'Routing row not found' }, { status: 404 });
  }

  // 4. parse + whitelist body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v;
  }

  // A freshly-picked Place ID (transient, not a column) resolves to a
  // canonical venue server-side and sets canonical_venue_id.
  const placeId = typeof body.place_id === 'string' ? body.place_id.trim() : '';
  const venueName = typeof body.venue_name === 'string' ? body.venue_name : '';
  if (placeId && venueName) {
    const canonicalId = await findOrCreateCanonicalVenue({
      placeId,
      name: venueName,
      city: typeof body.city === 'string' ? body.city : null,
      lat: typeof body.latitude === 'number' ? body.latitude : null,
      lng: typeof body.longitude === 'number' ? body.longitude : null,
    });
    if (canonicalId) updates.canonical_venue_id = canonicalId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No updatable fields in body' },
      { status: 400 }
    );
  }

  // 5. update
  const { data: updated, error: updateErr } = await supabase
    .from('routing')
    .update(updates)
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
