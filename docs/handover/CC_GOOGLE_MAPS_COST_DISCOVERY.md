# Google Maps cost hardening — Discovery (Phase D)

**Date:** 2026-06-25 · **Ticket:** CC_GOOGLE_MAPS_COST_HARDENING

## Directions (`/api/directions`)
- **No cache.** [api/directions/route.ts](../../src/app/api/directions/route.ts)
  calls Google on every request; nothing is persisted.
- **Caller** ([RoutingGrid.tsx L141](../../src/components/routing/RoutingGrid.tsx)):
  each `RoutingRowWithMenu` (one per leg) runs a `useEffect` that fetches
  `/api/directions` whenever `useGoogleDrive` is true and coords exist,
  keyed on `[useGoogleDrive, row.lat, row.lng, nextRow.lat, nextRow.lng]`.
  - Within a session the effect is already coord-keyed, so it does NOT
    re-fire on unrelated re-renders, and two components never share a leg
    (each leg is a distinct row→nextRow pair). So there is no *intra*-load
    duplication to fix — the component-state part of F1 is already fine.
  - But `driveHours` is component state that dies on unmount, so **every
    grid load re-fetches every leg** → the 184 calls. This is the real
    saving: a server-side cache so re-opening a routing costs 0 calls.
- **No drive-time persisted** anywhere (no `routing` column, no table).
  → F1 adds a `drive_time_cache` table keyed on (origin, destination, mode).

## Places autocomplete → details
- [VenueAutocomplete](../../src/components/routing/VenueAutocomplete.tsx) and
  [PlacesAutocompleteInput](../../src/components/spreadsheet-view/PlacesAutocompleteInput.tsx)
  debounce autocomplete (300ms, min 2 chars) and call
  `/api/places/details` on pick. **No session token today** (`grep
  sessiontoken` → none). So each debounced autocomplete request and the
  final Details lookup are billed separately.
- Selecting a suggestion DOES call Place Details — and the canonical-venue
  `place_id` capture (just shipped) uses the `placeId` the client already
  holds from the autocomplete suggestion, NOT a field from Details. So F2's
  session-token threading does not affect place_id capture.
  → F2 adds an `AutocompleteSessionToken` (UUID) per typing session,
  threaded through both proxies, so the whole session + Details bills as one
  Places **Per Session** SKU (unlimited free) instead of N Per-Request calls.

## Pricing estimate (the F3 surprise)
- The `google.places.autocomplete` estimate in
  [pricing.ts](../../src/lib/google/pricing.ts) is **already `2.83` per
  1,000 ($0.00283/call)** — and has been since it was introduced (single
  commit, never `0.5`). So the ticket's "dashboard shows $0.0005, ~5× low"
  is **stale**: those were historical `ai_usage_events` rows logged before
  the price card existed, not the current code.
- Verified live against developers.google.com/maps/billing-and-pricing
  (2026-06-25): Directions $5/1k, Autocomplete Per Request $2.83/1k,
  Place Details **Pro** $17/1k (our field mask includes contact+atmosphere
  → Pro tier, so 17 is right), Geocoding $5/1k. **All current estimates
  already match Google's list prices.** Free tier: 10,000 calls/SKU/month
  (Essentials) since 2025-03-01; Autocomplete **Per Session** is unlimited-
  free.
  → F3 is therefore NOT a price correction (numbers are right). It adds the
  missing documentation (list-estimate vs invoice + the per-SKU free tier +
  the session-token billing note) and refreshes the verified date.
