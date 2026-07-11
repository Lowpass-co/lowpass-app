/* ============================================================
   LOWPASS — Advance venue overlay (Q1 — pure, self-contained)

   The pure half of the advance venue block resolver: given a base
   ResolvedVenue (from resolveVenue) and the advance's OWN edited Venue Info
   values, per-field prefer the advance's own value, else keep the base.

   Type-only import of ResolvedVenue (erased at runtime) so this module has
   NO runtime dependency and can run under `node --experimental-strip-types`.
   The resolveVenue call itself lives in ./venue.ts.
   ============================================================ */

import type { ResolvedVenue } from '@/lib/venues/resolveVenue';

/** Minimal shape of an advance section: its id + the field ids it owns. */
export interface AdvanceVenueSection {
  template_id: string;
  fields?: { id?: string | null }[] | null;
}

export interface AdvanceVenueOwnValues {
  venue_name?: unknown;
  venue_address?: unknown;
  venue_website?: unknown;
  venue_capacity?: unknown;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The advance's own edited venue values, read from the Venue Info section in
 *  advance.data — the section owning a field with id `venue_name`. Returns null
 *  when there is no such section / no data. */
export function findAdvanceOwnVenue(
  sections: AdvanceVenueSection[] | null | undefined,
  data: Record<string, Record<string, unknown>> | null | undefined,
): AdvanceVenueOwnValues | null {
  if (!sections || !data) return null;
  const sec = sections.find((s) =>
    (s.fields ?? []).some((f) => f?.id === 'venue_name'),
  );
  if (!sec) return null;
  const v = data[sec.template_id];
  return v ? (v as AdvanceVenueOwnValues) : null;
}

/** Overlay the advance's own edited venue values on top of a base ResolvedVenue.
 *  Per-field: a non-blank own value wins, else the base (resolveVenue) value
 *  stands. `phone` has no in-advance field, so it always comes from the base. */
export function applyAdvanceOwnVenue(
  base: ResolvedVenue,
  own: AdvanceVenueOwnValues | null,
): ResolvedVenue {
  if (!own) return base;
  return {
    ...base,
    name: str(own.venue_name) ?? base.name,
    address: str(own.venue_address) ?? base.address,
    website: str(own.venue_website) ?? base.website,
    capacity: num(own.venue_capacity) ?? base.capacity,
  };
}
