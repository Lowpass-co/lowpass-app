/* ============================================
   LOWPASS — /venues (Venue SSOT — canonical venue library + edit)

   The canonical venue directory, scoped to the venues THIS workspace's routing
   references. Editing a canonical venue (name / address / city / country /
   capacity) flows through to every LIVE/upcoming show that references it; past
   and frozen shows keep their snapshot (see resolveVenue + the propagation
   notice in the editor).
   ============================================ */

import { redirect } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { PageHeader } from '@/components/ui/PageHeader';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { VenueLibraryClient, type VenueLibraryRow } from '@/components/venues/VenueLibraryClient';

export const dynamic = 'force-dynamic';

export default async function VenuesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const todayIso = new Date().toISOString().slice(0, 10);

  // Routing is RLS-scoped to the caller's workspace. Pull every row with a
  // canonical link + the joined canonical facts, then dedupe to distinct venues
  // and count how many upcoming/live shows reference each.
  const { data: rows } = await supabase
    .from('routing')
    .select(
      'canonical_venue_id, date, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)',
    )
    .not('canonical_venue_id', 'is', null);

  type CanonRow = {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    capacity: number | null;
  };
  type Row = {
    canonical_venue_id: string | null;
    date: string | null;
    venue_frozen_at: string | null;
    canonical: CanonRow | CanonRow[] | null;
  };

  const byId = new Map<string, VenueLibraryRow>();
  for (const r of (rows ?? []) as Row[]) {
    const c = Array.isArray(r.canonical) ? r.canonical[0] : r.canonical;
    if (!c?.id) continue;
    const existing =
      byId.get(c.id) ??
      ({
        id: c.id,
        name: c.name ?? '',
        address: c.address ?? null,
        city: c.city ?? null,
        country: c.country ?? null,
        capacity: c.capacity ?? null,
        upcomingCount: 0,
      } satisfies VenueLibraryRow);
    const isUpcoming = !r.venue_frozen_at && (r.date ?? '') >= todayIso;
    if (isUpcoming) existing.upcomingCount += 1;
    byId.set(c.id, existing);
  }
  const venues = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ProductShell active={null} artistId={null} productName="Venues">
      <div className="mx-auto max-w-5xl p-6">
        <PageHeader
          title="Venues"
          subtitle="Your routing's venue library. Edits to a venue flow through to upcoming shows; past shows keep their snapshot."
        />
        <div className="mt-6">
          <VenueLibraryClient venues={venues} />
        </div>
      </div>
    </ProductShell>
  );
}
