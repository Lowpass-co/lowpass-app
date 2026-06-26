/* ============================================================
   LOWPASS — Google API per-request pricing (Security audit §H2)

   Google bills most of these APIs PER REQUEST (not per token), so unlike
   the Anthropic price cards (per-MTok) these are flat micro-USD costs per
   successful call. They exist so the shared usage dashboard
   (ai_usage_events) can attribute approximate spend to Google calls and so
   the budget view isn't blind to map/places cost.

   ⚠️ APPROXIMATE — VERIFY before treating as billing-grade. Google Maps
   Platform pricing varies by SKU, region, and the monthly free tier, and
   changes over time. Rates below are representative list prices (USD per
   1,000 calls) as a planning figure, converted to micro-USD per call:

       cost_micros_per_call = (usd_per_1000 / 1000) * 1_000_000
                            =  usd_per_1000 * 1000

   Source to confirm: https://mapsplatform.google.com/pricing/ and
   https://developers.google.com/custom-search/v1/overview#pricing

   ⚠️ THESE ARE LIST-PRICE ESTIMATES FOR CAPPING + DASHBOARD VISIBILITY —
   NOT the invoice. Since 2025-03-01 Google replaced the pooled $200/mo
   credit with a PER-SKU monthly free tier: 10,000 free calls/month for
   each Essentials SKU (Directions, Places Autocomplete, Place Details,
   Geocoding all qualify). So the REAL charge for a SKU is typically $0
   until that SKU alone exceeds 10k calls in a month — the dashboard's
   running total over-states spend at low volume. The estimates exist to
   (a) enforce the internal cap and (b) flag when a SKU approaches its free
   limit at scale (hundreds/thousands of workspaces).

   Verified live against developers.google.com/maps/billing-and-pricing on
   2026-06-25 — all figures below match Google's current list prices.
   FRAGILE — re-check at next billing review.

   Note on Places Autocomplete: the figure below is the Per-Request SKU.
   With a session token (F2 — VenueAutocomplete / PlacesAutocompleteInput
   thread one), the typing session + its Place Details call bill as a
   single Per-Session SKU (Essentials, unlimited free), so a real
   session-tokened lookup typically costs $0.
   ============================================================ */

export type GoogleEndpoint =
  | 'google.geocode'
  | 'google.directions'
  | 'google.places.autocomplete'
  | 'google.places.details'
  | 'google.places.nearby'
  | 'google.places.airports'
  | 'google.cse.find-image'
  // Generative Language API — Gemini text embeddings (RAG index). Token-
  // priced upstream (gemini-embedding-001 ≈ $0.15 / 1M input tokens), but
  // recorded here as a flat representative per-call cost so it rides the
  // same ai_usage_events google lane as the Maps endpoints. Negligible &
  // approximate. This is the google provider lane — NOT the Anthropic
  // dollar-cap (sumMonthCost filters provider <> 'google').
  | 'ai.embeddings';

/** Representative list price, USD per 1,000 calls (see header — approximate). */
const USD_PER_1000: Record<GoogleEndpoint, number> = {
  'google.geocode': 5, // Geocoding API — Essentials, $5/1k (verified 2026-06-25)
  'google.directions': 5, // Directions — Essentials, $5/1k (verified 2026-06-25)
  'google.places.autocomplete': 2.83, // Autocomplete Per-Request — Essentials, $2.83/1k (verified 2026-06-25; Per-Session is free, see header)
  'google.places.details': 17, // Place Details — Pro tier $17/1k (our field mask incl. contact+atmosphere → Pro; verified 2026-06-25)
  'google.places.nearby': 32, // Nearby Search
  'google.places.airports': 2.83, // Autocomplete-backed airport pick
  'google.cse.find-image': 5, // Custom Search JSON API ($5 / 1000, 10k/day cap)
  'ai.embeddings': 0.03, // gemini-embedding-001 — ~$0.15/1M tok; ≈ $0.03/1k calls at ~200 tok/call
};

/** Approximate micro-USD cost of one successful Google call for `endpoint`. */
export function googleCostMicros(endpoint: GoogleEndpoint): number {
  const per1000 = USD_PER_1000[endpoint];
  if (!Number.isFinite(per1000)) return 0;
  // usd_per_1000 * 1000 == micro-USD per call (see header identity).
  return Math.round(per1000 * 1000);
}
