/* ============================================
   LOWPASS — Tour Routing API

   GET: List routing (?lite=1 → { routing } subset + workspace check;
        default → full rows array for editors/budget).
   POST: ID-preserving reconcile of a tour's routing (UPDATE kept dates by
        (tour_id, date), INSERT new, DELETE only removed). Preserves routing.id so
        routing(id) children — budget_income, rider folders, advances — survive an
        edit. (Was delete-all-reinsert, which cascade-wiped them.)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveCanonicalVenues, type CanonicalVenueFacts } from '@/lib/venues/canonical';

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

  // Part 1 — ID-PRESERVING RECONCILE (was delete-all-then-reinsert). The old
  // path deleted every routing row for the tour and reinserted with fresh UUIDs,
  // which cascade-deleted EVERY routing(id) child for the whole tour on every
  // save: budget_income (+ settlement, rooming_grid, budget_version_income),
  // rider_folders/packs/assets, advance_intake_links/form_configs/instances —
  // and SET-NULLed budget_line_items, flights, deal_memos, rooms, expenses.
  //
  // Now: match by (tour_id, date) — routing has UNIQUE(tour_id, date) and the
  // grid pins each row to a fixed date, so the date is a stable identity. UPDATE
  // kept dates in place (routing.id preserved → children survive), INSERT
  // genuinely-new dates, and DELETE only dates removed from the payload (their
  // children cascade — correct, that show is gone). The upsert's ON CONFLICT
  // DO UPDATE never touches the primary key, so ids are preserved.
  const { data: existingRows, error: existingErr } = await supabase
    .from('routing')
    .select('id, date')
    .eq('tour_id', tourId);
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  type IncomingRow = {
    date: string; day_type?: string; city?: string; country?: string; address?: string; venue_id?: string;
    venue_name?: string; venue_website?: string; venue_phone?: string; venue_capacity?: number | null;
    notes?: string; latitude?: number; longitude?: number; transport_to_next?: string;
    place_id?: string | null; canonical_venue_id?: string | null;
  };
  const typedRows = rows as IncomingRow[];

  // Resolve any freshly-picked Place IDs to canonical venues (service-role,
  // deduped). Rows without a place_id keep their round-tripped canonical link
  // so the bulk delete+reinsert never drops an existing one.
  const factsByPlaceId = new Map<string, CanonicalVenueFacts>();
  for (const r of typedRows) {
    const pid = r.place_id?.trim();
    if (pid && r.venue_name && !factsByPlaceId.has(pid)) {
      factsByPlaceId.set(pid, {
        placeId: pid,
        name: r.venue_name,
        city: r.city ?? null,
        lat: r.latitude ?? null,
        lng: r.longitude ?? null,
        // Migration 226 — carry address + capacity into the library so the row's
        // Google facts populate/backfill the canonical venue.
        address: r.address ?? null,
        capacity: r.venue_capacity ?? null,
      });
    }
  }
  const canonicalByPlaceId = await resolveCanonicalVenues(factsByPlaceId);

  const desiredRows = typedRows.map((r: IncomingRow, i: number) => ({
    tour_id: tourId,
    date: r.date,
    day_type: r.day_type ?? '',
    city: r.city ?? '',
    country: r.country ?? null,
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
    canonical_venue_id:
      (r.place_id ? canonicalByPlaceId.get(r.place_id.trim()) : null) ?? r.canonical_venue_id ?? null,
    sequence: i,
  }));

  // UPDATE kept dates + INSERT new dates in one call. ON CONFLICT (tour_id, date)
  // DO UPDATE keeps each existing row's primary key → its routing(id) children
  // (income, folders, …) are untouched.
  const { data: inserted, error: insertError } = await supabase
    .from('routing')
    .upsert(desiredRows, { onConflict: 'tour_id,date' })
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // DELETE only the dates that are genuinely gone from the payload — their
  // children cascade away, which is correct (the show was removed). Dates still
  // present were UPDATEd above and keep their ids + children.
  const desiredDates = new Set(desiredRows.map((d) => d.date));
  const removedIds = (existingRows ?? [])
    .filter((r) => !desiredDates.has(String((r as { date: string }).date)))
    .map((r) => (r as { id: string }).id);
  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('routing')
      .delete()
      .eq('tour_id', tourId)
      .in('id', removedIds);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
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
