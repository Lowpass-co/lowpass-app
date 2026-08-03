/* ============================================
   LOWPASS — /api/venues/canonical/[id]  (Venue SSOT — venue edit)

   GET   → the canonical venue + a propagation list: the current workspace's
           UPCOMING/live routing rows that reference it (date ≥ today AND not
           frozen). Past/frozen rows are NOT listed — their venue is snapshotted
           and an edit here never rewrites them.
   PATCH → edit the canonical facts (name/address/city/country/capacity). Writes
           go through the service client because canonical_venues is world-read
           but client-write-denied (migration 214). canonical_venues is a shared
           cross-workspace directory — an edit is a facts correction that every
           workspace's LIVE shows referencing it will reflect.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';

const VENUE_COLS = 'id, name, address, city, country, capacity';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: venue, error } = await supabase
    .from('canonical_venues')
    .select(VENUE_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

  // Upcoming/live routing rows in THIS workspace that reference the venue (RLS
  // scopes routing to the caller's workspace). Frozen / past rows excluded.
  const { data: rows } = await supabase
    .from('routing')
    .select('id, date, city, tour:tours(id, name)')
    .eq('canonical_venue_id', id)
    .is('venue_frozen_at', null)
    .gte('date', todayIso())
    .order('date', { ascending: true });

  const upcomingShows = (rows ?? []).map((r) => {
    const tour = Array.isArray(r.tour) ? r.tour[0] : r.tour;
    return {
      routingId: r.id as string,
      date: r.date as string,
      city: (r.city as string | null) ?? null,
      tourId: (tour as { id?: string } | null)?.id ?? null,
      tourName: (tour as { name?: string } | null)?.name ?? 'Tour',
    };
  });

  return NextResponse.json({ venue, upcomingShows });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();

  /* P0-A — this handler authenticated and then wrote a SHARED CROSS-WORKSPACE
     table with a SERVICE-ROLE client, which bypasses RLS entirely. Any
     authenticated user of any workspace could rewrite any global venue by id.
     Authentication was doing the work authorization should have been.

     Role-gated to admin/manager. There is no `venues` entry in
     RESOURCE_CATALOG, so there is no grant to check — and inventing one here
     would create a permission nobody can actually grant. */
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;

  const { id } = await params;

  let body: {
    name?: string;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    capacity?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    patch.name = name;
  }
  if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null;
  if (body.city !== undefined) patch.city = body.city ? String(body.city).trim() : null;
  if (body.country !== undefined) patch.country = body.country ? String(body.country).trim() : null;
  if (body.capacity !== undefined) {
    const n = Number(body.capacity);
    patch.capacity = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  /* Service client retained: canonical_venues is client-write-denied by RLS
     (mig 214), so dropping it needs a migration granting a role-predicated
     write policy — paste-gated on Adam, and tracked as the durable fix. Until
     then the guard above is the ONLY thing between a caller and this table,
     which is exactly why it is the first line of the handler.

     STILL TRUE AFTER THIS FIX, and Adam's call: any workspace's admin/manager
     can still correct any venue in the shared directory. That is the venue
     library working as designed — the edit surface is the global /venues list,
     not a routing row — so scoping it to "venues my workspace books" would
     remove a feature rather than close a hole. The hole was that ROLE was
     unchecked; the sharing is deliberate. */
  const svc = createServiceSupabaseClient();
  const { data, error } = await svc
    .from('canonical_venues')
    .update(patch)
    .eq('id', id)
    .select(VENUE_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

  return NextResponse.json({ venue: data });
}
