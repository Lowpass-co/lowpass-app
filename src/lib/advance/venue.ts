/* ============================================================
   LOWPASS — Advance venue block resolver (Q1 — Adam's call)

   On the advance READ surfaces the venue block shows the advance's OWN
   edited venue value IF the TM set it in-advance, ELSE it falls back to
   resolveVenue(canonical). The "advance's own" values live in the advance's
   "Venue Info" section inside advance_instances.data (field ids
   venue_name / venue_address / venue_website / venue_capacity).

   Guardrail intact: the canonical fallback goes through resolveVenue (the
   ONE reader of the gated routing.venue_* columns). The pure overlay logic
   lives in ./venue-overlay.ts (self-contained, harnessed).
   ============================================================ */

import {
  resolveVenue,
  type RoutingVenueSource,
  type ResolvedVenue,
} from '@/lib/venues/resolveVenue';
import {
  findAdvanceOwnVenue,
  applyAdvanceOwnVenue,
  type AdvanceVenueSection,
} from './venue-overlay';

export { findAdvanceOwnVenue, type AdvanceVenueSection } from './venue-overlay';

/**
 * The venue block for advance READ surfaces: the advance's OWN edited value
 * wins per-field when set, else resolveVenue(canonical). Pure + synchronous.
 */
export function resolveAdvanceVenue(
  routing: RoutingVenueSource,
  sections: AdvanceVenueSection[] | null | undefined,
  data: Record<string, Record<string, unknown>> | null | undefined,
  opts?: { today?: string },
): ResolvedVenue {
  return applyAdvanceOwnVenue(
    resolveVenue(routing, opts),
    findAdvanceOwnVenue(sections, data),
  );
}
