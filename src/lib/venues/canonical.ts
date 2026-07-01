/* ============================================================
   LOWPASS — Canonical venue find-or-create (service-role)

   The single write path into public.canonical_venues (migration 214).
   canonical_venues is a GLOBAL, world-readable-to-authed directory with
   service-role-only writes — so this helper runs server-side with the
   service client and is the ONLY place rows are created/refreshed.

   Keyed on google_place_id: the same real-world venue picked in any
   workspace resolves to one canonical id. Carries facts only (name /
   city / country / lat / lng) — never workspace data, never capacity in
   this floor (no neutral source — Adam 2026-06-25).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';

export interface CanonicalVenueFacts {
  placeId: string;
  name: string;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Formatted address (migration 226) — facts only, world-readable. */
  address?: string | null;
  /** Seated/standing capacity when the Place carried one. */
  capacity?: number | null;
}

/**
 * Find the canonical venue for a Google Place ID, creating it if absent.
 * Returns the canonical_venue_id, or null if there's nothing to resolve
 * (no placeId/name) or the write fails (caller treats null as "no link").
 *
 * On find, BACKFILLS address/capacity when the existing row is missing them
 * (rows created before migration 226 / before capacity was captured). Fill-only —
 * never overwrites a value that's already there.
 */
export async function findOrCreateCanonicalVenue(
  facts: CanonicalVenueFacts,
  svc: SupabaseClient = createServiceSupabaseClient(),
): Promise<string | null> {
  const placeId = facts.placeId?.trim();
  const name = facts.name?.trim();
  if (!placeId || !name) return null;

  const address = facts.address?.trim() || null;
  const capacity =
    typeof facts.capacity === 'number' && Number.isFinite(facts.capacity) ? facts.capacity : null;

  // Fast path: already known — backfill address/capacity if this row predates
  // them (a Place pick can carry facts an older row lacks). Fill-only.
  const { data: existing } = await svc
    .from('canonical_venues')
    .select('id, address, capacity')
    .eq('google_place_id', placeId)
    .maybeSingle();
  if (existing?.id) {
    const patch: Record<string, unknown> = {};
    if (address && !((existing as { address?: string | null }).address ?? null)) patch.address = address;
    if (capacity != null && (existing as { capacity?: number | null }).capacity == null) patch.capacity = capacity;
    if (Object.keys(patch).length > 0) {
      await svc.from('canonical_venues').update(patch).eq('id', existing.id);
    }
    return existing.id as string;
  }

  // Create (upsert on the unique place_id absorbs a concurrent create).
  const { data, error } = await svc
    .from('canonical_venues')
    .upsert(
      {
        google_place_id: placeId,
        name,
        city: facts.city ?? null,
        country: facts.country ?? null,
        lat: typeof facts.lat === 'number' ? facts.lat : null,
        lng: typeof facts.lng === 'number' ? facts.lng : null,
        address,
        capacity,
      },
      { onConflict: 'google_place_id' },
    )
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[canonical-venues] upsert failed', error);
    return null;
  }
  return data.id as string;
}

/**
 * Resolve many Place IDs to canonical ids in one pass (deduped). Used by
 * the bulk routing save. Returns Map<placeId, canonicalId>.
 */
export async function resolveCanonicalVenues(
  factsByPlaceId: Map<string, CanonicalVenueFacts>,
  svc: SupabaseClient = createServiceSupabaseClient(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [placeId, facts] of factsByPlaceId) {
    const id = await findOrCreateCanonicalVenue(facts, svc);
    if (id) out.set(placeId, id);
  }
  return out;
}
