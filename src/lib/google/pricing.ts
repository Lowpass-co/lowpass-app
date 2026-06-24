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
   Last set: 2026-06-07 (mark FRAGILE — re-check at next billing review).
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
  'google.geocode': 5, // Geocoding API
  'google.directions': 5, // Directions API (basic)
  'google.places.autocomplete': 2.83, // Autocomplete — per request (session pricing varies)
  'google.places.details': 17, // Place Details (Basic+Contact+Atmosphere mask ≈ higher; list ~$17)
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
