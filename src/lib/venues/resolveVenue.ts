/* ============================================================
   LOWPASS — Venue SSOT resolver (CC_VENUE_SSOT.md, run order 2)

   ONE per-row resolver for a routing row's venue. A routing row's venue is a
   LIVE reference to canonical_venues until its show day passes, then a FROZEN
   snapshot in the routing.venue_* columns:

     • LIVE  (date ≥ today AND venue_frozen_at IS NULL AND not locked, AND a
              canonical row is available) → fields come from canonical_venues.
     • FROZEN (venue_frozen_at set, day passed, or day locked — OR no canonical
              link/row) → fields come from the routing.venue_* snapshot.

   This is the ONLY module (besides types + the migration) allowed to read the
   gated routing venue columns (venue_name / venue_phone / venue_website /
   venue_capacity). Every display consumer goes through resolveVenue().

   NOTE — distinct from src/lib/venues/canonical.ts: that module find-or-creates
   canonical rows by google_place_id and batch-resolves place_ids → canonical
   ids (write path). This module is the read path: the live-vs-frozen
   discriminator. Don't conflate them.

   v1 scope: canonical_venues has no phone/website column, so phone/website
   always come from the routing row (they're the only source). "Locked day" has
   no routing column yet → the optional `locked` hint is accepted for a future
   migration but defaults to false. On-read freeze lives in freezePassedVenues()
   below (no cron).
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

/** 'canonical' = rendered from the live canonical directory. 'frozen' = rendered
 *  from the routing.venue_* columns (a past-frozen show OR a free-text venue with
 *  no canonical link — in both cases the routing columns are authoritative). */
export type VenueSource = 'canonical' | 'frozen';

export interface ResolvedVenue {
  source: VenueSource;
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  capacity: number | null;
  city: string | null;
  country: string | null;
}

/** The subset of a canonical_venues row the resolver renders. Fetch via
 *  `.select('id, name, address, city, country, capacity')` or the join alias
 *  `canonical:canonical_venues(id, name, address, city, country, capacity)`. */
export interface CanonicalVenueRow {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
}

/** The routing-row shape the resolver reads: the frozen snapshot columns + the
 *  discriminators + an optional joined canonical row. All fields optional so any
 *  routing-row query shape can be passed. */
export interface RoutingVenueSource {
  id?: string;
  date?: string | null;
  venue_frozen_at?: string | null;
  canonical_venue_id?: string | null;
  venue_name?: string | null;
  address?: string | null;
  venue_phone?: string | null;
  venue_website?: string | null;
  venue_capacity?: number | null;
  city?: string | null;
  country?: string | null;
  /** Joined canonical_venues row (Supabase returns object or 1-element array). */
  canonical?: CanonicalVenueRow | CanonicalVenueRow[] | null;
  /** Future explicit day lock — no routing column today, defaults to false. */
  locked?: boolean | null;
}

function nn(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function todayIso(today?: string): string {
  return today ?? new Date().toISOString().slice(0, 10);
}
function firstCanonical(row: RoutingVenueSource): CanonicalVenueRow | null {
  const c = row.canonical;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

/** True when the row's venue should be read from the frozen routing.venue_*
 *  snapshot rather than the live canonical row: already frozen, day locked, or
 *  the show day has passed. */
export function isVenueFrozen(row: RoutingVenueSource, today?: string): boolean {
  if (row.venue_frozen_at) return true;
  if (row.locked) return true;
  const d = (row.date ?? '').slice(0, 10);
  if (!d) return false;
  return d < todayIso(today);
}

/** Resolve a single routing row's venue. Pure + synchronous. */
export function resolveVenue(row: RoutingVenueSource, opts?: { today?: string }): ResolvedVenue {
  const canonical = firstCanonical(row);
  const frozen = isVenueFrozen(row, opts?.today);

  // Frozen, or no canonical row available → the routing.venue_* snapshot is the
  // truth (correct for past shows; the safe fallback for a live row a consumer
  // fetched without the canonical join, and for free-text venues).
  if (frozen || !canonical) {
    return {
      source: 'frozen',
      name: nn(row.venue_name),
      address: nn(row.address),
      phone: nn(row.venue_phone),
      website: nn(row.venue_website),
      capacity: numOrNull(row.venue_capacity),
      city: nn(row.city),
      country: nn(row.country),
    };
  }

  // Live: canonical is the source for name/address/city/country/capacity.
  // phone/website have no canonical column (v1) → keep the routing values.
  return {
    source: 'canonical',
    name: nn(canonical.name) ?? nn(row.venue_name),
    address: nn(canonical.address) ?? nn(row.address),
    phone: nn(row.venue_phone),
    website: nn(row.venue_website),
    capacity: numOrNull(canonical.capacity) ?? numOrNull(row.venue_capacity),
    city: nn(canonical.city) ?? nn(row.city),
    country: nn(canonical.country) ?? nn(row.country),
  };
}

/* ---- Batch hydration for consumers that hold routing rows without the join ---- */

const CANONICAL_COLS = 'id, name, address, city, country, capacity';

/** Fetch the canonical rows for a set of routing rows in one query and return a
 *  Map<canonical_venue_id, CanonicalVenueRow>. Reuses the canonical directory's
 *  world-readable SELECT (no service role needed for reads). */
export async function fetchCanonicalMap(
  supabase: SupabaseClient,
  rows: Array<{ canonical_venue_id?: string | null }>,
): Promise<Map<string, CanonicalVenueRow>> {
  const ids = Array.from(
    new Set(rows.map((r) => r.canonical_venue_id).filter((v): v is string => !!v)),
  );
  const map = new Map<string, CanonicalVenueRow>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from('canonical_venues').select(CANONICAL_COLS).in('id', ids);
  for (const c of (data ?? []) as CanonicalVenueRow[]) map.set(c.id, c);
  return map;
}

/** Resolve venues for many routing rows: hydrate canonicals in one query, then
 *  run the per-row resolver. Returns Map<routing.id, ResolvedVenue>. */
export async function resolveVenuesForRows(
  supabase: SupabaseClient,
  rows: RoutingVenueSource[],
  opts?: { today?: string },
): Promise<Map<string, ResolvedVenue>> {
  const canonicalMap = await fetchCanonicalMap(supabase, rows);
  const out = new Map<string, ResolvedVenue>();
  for (const r of rows) {
    if (!r.id) continue;
    const withCanon: RoutingVenueSource = r.canonical
      ? r
      : { ...r, canonical: r.canonical_venue_id ? canonicalMap.get(r.canonical_venue_id) ?? null : null };
    out.set(r.id, resolveVenue(withCanon, opts));
  }
  return out;
}

/* ---- On-read freeze (no cron) ---- */

/** Freeze any rows whose show day has passed but whose venue is still live:
 *  snapshot the resolved canonical values INTO routing.venue_* and stamp
 *  venue_frozen_at. First read after the date passes performs the write; a row
 *  already frozen, free-text (no canonical link), or still upcoming is skipped.
 *
 *  Idempotent: the `venue_frozen_at IS NULL` guard means a second read is a
 *  no-op. Best-effort — a write failure never blocks the read (logged only).
 *  Returns the routing ids that were frozen. */
export async function freezePassedVenues(
  supabase: SupabaseClient,
  rows: RoutingVenueSource[],
  opts?: { today?: string },
): Promise<string[]> {
  const today = todayIso(opts?.today);
  // Candidates: date passed, not yet frozen, has a canonical link to snapshot.
  const candidates = rows.filter(
    (r) =>
      r.id &&
      !r.venue_frozen_at &&
      r.canonical_venue_id &&
      (r.date ?? '').slice(0, 10) !== '' &&
      (r.date ?? '').slice(0, 10) < today,
  );
  if (candidates.length === 0) return [];

  const canonicalMap = await fetchCanonicalMap(supabase, candidates);
  const frozenIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const r of candidates) {
    const canonical = r.canonical_venue_id ? canonicalMap.get(r.canonical_venue_id) ?? null : null;
    // Resolve the LIVE value as it stands right now (canonical), then write it
    // into the snapshot columns so the frozen record equals the last live truth.
    const live = resolveVenue({ ...r, canonical, venue_frozen_at: null, date: today }, { today });
    const { error } = await supabase
      .from('routing')
      .update({
        venue_name: live.name,
        address: live.address,
        venue_phone: live.phone,
        venue_website: live.website,
        venue_capacity: live.capacity,
        city: live.city ?? r.city ?? '',
        country: live.country,
        venue_frozen_at: nowIso,
      })
      .eq('id', r.id as string)
      .is('venue_frozen_at', null); // race guard — only the first writer wins
    if (error) {
      console.error(`[venue-freeze ${r.id}] failed:`, error.message);
      continue;
    }
    // Reflect the write into the in-memory row so a resolve pass in the SAME
    // request renders the just-frozen snapshot (not the pre-freeze columns).
    Object.assign(r, {
      venue_name: live.name,
      address: live.address,
      venue_phone: live.phone,
      venue_website: live.website,
      venue_capacity: live.capacity,
      city: live.city ?? r.city ?? '',
      country: live.country,
      venue_frozen_at: nowIso,
    });
    frozenIds.push(r.id as string);
  }
  return frozenIds;
}
