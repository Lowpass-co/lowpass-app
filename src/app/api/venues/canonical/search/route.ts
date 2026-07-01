/* ============================================
   LOWPASS — GET /api/venues/canonical/search?q=&city=

   Type-to-search the app-wide venue library (canonical_venues, migration 214 +
   226). World-readable to authed users (RLS SELECT policy) — no workspace data,
   facts only. Case-insensitive `ilike` on name, optionally narrowed by city.
   Returns the facts the routing grid auto-fills from: id · name · city · country ·
   address · capacity · lat · lng.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export interface CanonicalVenueMatch {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const city = (searchParams.get('city') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ venues: [] });

  // Escape ilike wildcards so a literal % / _ in the query can't widen the match.
  const esc = (s: string) => s.replace(/[%_\\]/g, (m) => `\\${m}`);
  let query = supabase
    .from('canonical_venues')
    .select('id, name, city, country, address, capacity, lat, lng')
    .ilike('name', `%${esc(q)}%`)
    .order('name', { ascending: true })
    .limit(8);
  if (city) query = query.ilike('city', `%${esc(city)}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const venues: CanonicalVenueMatch[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    city: (r.city as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    capacity: typeof r.capacity === 'number' ? r.capacity : null,
    lat: typeof r.lat === 'number' ? r.lat : null,
    lng: typeof r.lng === 'number' ? r.lng : null,
  }));
  return NextResponse.json({ venues });
}
