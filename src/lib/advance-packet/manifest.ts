/* ============================================
   LOWPASS — Advance packet manifest (Sprint 12 §11a)

   Resolves the list of documents that make up the advance
   packet for a (tour, routing?) pair:

     - Riders         (rider_packs WHERE kind='rider' AND
                       tour_id=$ ORDER BY scope, title)
     - Channel lists  (rider_packs WHERE kind='channel_list'
                       AND tour_id=$)
     - Hire jobs      (rental_jobs WHERE tour_id=$)
     - Assets         (rider_assets attached to any pack above)

   Pure server-side helper — call with either the cookie-bound
   server client (auth-gated /api/advance-packets/.../route)
   or the service-role client (public /a/[token] reader).

   The shape mirrors what the §11b packet page renders + what
   §11c's PDF bundler iterates over. Keeping a single canonical
   shape means the auth-gated UI, public reader, and PDF
   renderer all see the same data.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { resolveShowDocuments } from '@/lib/rider-packs/attachments';

export interface PacketDoc {
  kind: 'rider' | 'channel_list' | 'rental_job';
  id: string;
  title: string;
  /** Free-form sub-info shown beneath the title in the UI
   *  (e.g. "Tech rider · 8 sections", "24 items"). */
  subtitle?: string | null;
  /** Set for rider_packs only — pack scope for sort order
   *  (show-scope first, then tour, then artist). */
  scope?: 'artist' | 'tour' | 'show';
}

export interface PacketManifest {
  tour: {
    id: string;
    name: string;
    currency: string;
    artist_id: string | null;
    artist_name: string | null;
  };
  routing: {
    id: string;
    date: string;
    day_type: string;
    /** Venue SSOT — resolved DISPLAY value (live→canonical, past/frozen→snapshot),
     *  stamped by getPacketManifest via resolveVenue. Consumers render this as-is. */
    venue?: string | null;
    city?: string | null;
  } | null;
  docs: PacketDoc[];
}

/** Build the packet manifest. routingId can be null for a
 *  whole-tour packet (no routing scope). */
export async function getPacketManifest(
  supabase: SupabaseClient,
  tourId: string,
  routingId: string | null,
): Promise<PacketManifest | null> {
  /* Tour + artist lookup. Bail if RLS hides the tour from
     the caller — null lets the route return 404. */
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, currency, artist_id, artists(name)')
    .eq('id', tourId)
    .maybeSingle<{
      id: string;
      name: string;
      currency: string;
      artist_id: string | null;
      artists: { name: string } | { name: string }[] | null;
    }>();
  if (!tour) return null;

  /* artists embed comes back as object OR array depending on
     PostgREST cardinality inference. Normalise. */
  const artistRow = Array.isArray(tour.artists) ? tour.artists[0] : tour.artists;
  const artistName = artistRow?.name ?? null;

  let routing: PacketManifest['routing'] = null;
  if (routingId) {
    // Venue SSOT — join canonical + discriminators, resolve live-vs-frozen, and
    // stamp the resolved DISPLAY value. PURE READ (this is the seam feeding the
    // packet PDF route + PacketView + PublicPacketView) — no freeze write; the
    // public route's service client + the authed client both read canonical.
    const { data: r } = await supabase
      .from('routing')
      .select('id, date, day_type, city, country, address, venue_name, venue_capacity, venue_frozen_at, canonical_venue_id, canonical:canonical_venues(id, name, address, city, country, capacity)')
      .eq('id', routingId)
      .eq('tour_id', tourId)
      .maybeSingle<RoutingVenueSource & { id: string; date: string; day_type: string }>();
    if (r) {
      const v = resolveVenue(r);
      routing = { id: r.id, date: r.date, day_type: r.day_type, venue: v.name, city: v.city };
    }
  }

  /* Riders + channel lists. rider_packs.kind discriminates
     between 'rider' and 'channel_list'. Scope sort gives a
     stable "more specific first" order (show → tour → artist). */
  const { data: packs } = await supabase
    .from('rider_packs')
    .select('id, title, kind, scope')
    .eq('tour_id', tourId)
    .order('scope', { ascending: true })
    .order('title', { ascending: true });

  const docs: PacketDoc[] = [];
  for (const p of (packs ?? []) as Array<{
    id: string;
    title: string | null;
    kind: 'rider' | 'channel_list';
    scope: 'artist' | 'tour' | 'show';
  }>) {
    docs.push({
      kind: p.kind,
      id: p.id,
      title: p.title?.trim() || (p.kind === 'rider' ? 'Rider' : 'Channel list'),
      scope: p.scope,
    });
  }

  /* Decouple phase A (2026-08-05) — the packet is SHOW-AWARE now. If this
     show (or the tour) has an attached channel-list document version, it
     REPLACES the tour-wide channel_list packs in the manifest: Saturday's
     packet shows Saturday's version, not whatever the pack scan found. Same
     for stage plots when a packet doc type exists for them. Tours with no
     attachments keep today's behaviour untouched. */
  try {
    const attachedByKind = await resolveShowDocuments(supabase, tourId, routingId ?? null);
    const attachedCl = attachedByKind.channel_list;
    if (attachedCl) {
      const kept = docs.filter((d) => d.kind !== 'channel_list');
      kept.push({
        kind: 'channel_list',
        id: attachedCl.document_pack_id,
        title: attachedCl.version_label
          ? `${attachedCl.title}`
          : attachedCl.title || 'Channel list',
        scope: 'show',
      });
      docs.length = 0;
      docs.push(...kept);
    }
  } catch {
    /* attachments table absent pre-migration — legacy list stands */
  }

  /* Rental / hire jobs. Filter to the tour. Routing-scoped
     filtering isn't supported by the rental_jobs schema yet
     (jobs attach to tour, not to a specific show), so the
     same list shows for every routing under the tour. */
  const { data: jobs } = await supabase
    .from('rental_jobs')
    .select('id, name, status')
    .eq('tour_id', tourId)
    .order('created_at', { ascending: false });

  for (const j of (jobs ?? []) as Array<{ id: string; name: string; status: string | null }>) {
    docs.push({
      kind: 'rental_job',
      id: j.id,
      title: j.name || 'Hire job',
      subtitle: j.status ?? null,
    });
  }

  return {
    tour: {
      id: tour.id,
      name: tour.name,
      currency: tour.currency,
      artist_id: tour.artist_id,
      artist_name: artistName,
    },
    routing,
    docs,
  };
}
