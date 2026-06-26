# Google Maps cost-hardening smoke tests

> **Last bulk verification**: (pending — feat/google-maps-cost-hardening)

Walk these after changes to the Directions / Places proxies or their
cost estimates. Format defined in `docs/smoke-tests/README.md`. Prefix:
`MAPS`. **Prereq: migration 218 applied; `GOOGLE_PLACES_API_KEY` set.**

## Directions cache

#### MAPS-01 — Re-opening a routing makes zero new directions calls

**Do**: Open a routing grid with several legs (coords set) so drive times
compute. Note the `google.directions` count on `/admin/ai-usage` (or the
Network tab). Leave and re-open the same routing.

**Expect**: First open computes + caches each leg (N calls, N
`drive_time_cache` rows). Second open returns drive times with **zero**
new `google.directions` calls / events — served from `drive_time_cache`.
A brand-new leg (move a coordinate) computes once, then caches.

**Last verified**:

## Places session tokens

#### MAPS-02 — A venue lookup is one Places session

**Do**: In the routing venue field, type a venue name (several debounced
keystrokes) and pick a suggestion. Inspect the requests.

**Expect**: Every `/api/places/autocomplete` request for that typing
session carries the same `sessiontoken`, and the `/api/places/details`
call on pick carries it too — Google bills the whole lookup as one
Per-Session SKU (free), not N Per-Request calls + a Details charge.
Starting a new lookup uses a fresh token. **Confirm against the real
Google Cloud billing console**, not the internal estimate.

#### MAPS-03 — place_id capture still works

**Do**: After MAPS-02, save the routing row.

**Expect**: `routing.canonical_venue_id` is still set (the session token
doesn't disturb the `place_id` capture — the client holds the Place ID
from the suggestion).

**Last verified**:

## Estimate honesty

#### MAPS-04 — Estimate matches Google + documents the free tier

**Do**: Read `src/lib/google/pricing.ts`.

**Expect**: Each SKU figure matches Google's current list price (verified
date in-comment): Directions $5/1k, Autocomplete Per-Request $2.83/1k,
Place Details Pro $17/1k, Geocoding $5/1k. The header documents that
these are list-price ESTIMATES (not the invoice) and that each Essentials
SKU has a 10,000-call/month free tier (since 2025-03-01), so real charges
are typically $0 until a SKU exceeds its cap.

**Note**: the dashboard's *historical* autocomplete rows may show a lower
per-call cost — those were logged before the price card existed; only new
events use the current figure.

**Last verified**:

## Known broken

(None yet.)

## Retired

(None yet.)
