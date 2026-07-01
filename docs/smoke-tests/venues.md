# Canonical venues smoke tests

> **Last bulk verification**: (pending — feat/canonical-venues)

Walk these after changes to the canonical-venue identity layer (the
Community floor). Format defined in `docs/smoke-tests/README.md`.
Prefix: `VEN`. **Prereq: migration 214 applied; `GOOGLE_PLACES_API_KEY`
set.**

## Capture (going forward)

#### VEN-01 — Picking a venue links the canonical row

**Do**: In the routing grid (or calendar), pick a venue via the Places
autocomplete and save. Inspect the routing row and `canonical_venues`.

**Expect**: `routing.canonical_venue_id` is set; a `canonical_venues`
row exists with that `google_place_id` (created if it didn't exist).
`venue_name` is still populated (back-compat).

**Last verified**:

#### VEN-02 — Same real venue → same canonical id across workspaces

**Do**: In workspace A, route a show at "O2 Academy Brixton" (pick it).
In workspace B, do the same (pick the same Places suggestion). Compare
the two routing rows' `canonical_venue_id`.

**Expect**: Identical `canonical_venue_id` — the whole point. One
`canonical_venues` row, two workspaces pointing at it.

**Last verified**:

#### VEN-03 — Round-trip preserves the link

**Do**: On a routing row already linked (VEN-01), edit an unrelated field
(e.g. notes) and save again. Re-check `canonical_venue_id`.

**Expect**: Still set. The bulk delete+reinsert save round-trips
`canonical_venue_id` (it is not dropped just because no new pick happened).

**Last verified**:

## Isolation (the seam)

#### VEN-04 — Cross-workspace isolation still holds

**Do**: As a member of workspace A, attempt to read workspace B's
`routing` / `venues` rows (e.g. via the API / a crafted query).

**Expect**: Nothing — A only ever sees A's routing/venues (unchanged
RLS). A *can* read the shared `canonical_venues` facts (name/place_id/
city), but never *which* workspace played where. Facts shared, mapping
private.

**Last verified**:

## Backfill

#### VEN-05 — Backfill links high-confidence, queues ambiguous

**Do**: As a workspace admin, `POST /api/venues/canonical/backfill`.
Inspect the response + `canonical_venue_candidates`.

**Expect**: Rows whose name clearly matches a Place (e.g. "O2 Academy
Brixton") are auto-linked (`linked_rows` > 0). Ambiguous names (e.g.
"Ally Pally", a bare "The Club") are NOT auto-linked — they appear in
`canonical_venue_candidates` (status='pending'). Re-running does not
duplicate candidates and never overwrites an existing
`canonical_venue_id`.

**Last verified**:

## Known broken

(None yet.)

## Venue-library search API (feat/routing-venue-search — Part 2 foundation)

> `GET /api/venues/canonical/search?q=&city=` — type-to-search the world-readable
> venue library (`ilike` on name, optional city narrow), returning the facts the
> routing grid auto-fills from (id · name · city · country · address · capacity ·
> lat · lng). Auth-gated (RLS SELECT); facts only, no workspace data. This is the
> enabling foundation for venue-first routing.

- **ROUTE-VEN-00 — search endpoint.** `q` < 2 chars → empty. ilike wildcards in the
  query are escaped so a literal `%`/`_` can't widen the match. Limit 8, name-ordered.
  (Verified: build registers `ƒ /api/venues/canonical/search`; escape helper proven;
  tsc/eslint clean.)
- **ROUTE-VEN UI — LANDED** (see the routing section in `operations.md` for the
  library-first grid + the Adam live-test script). The venue field is now
  library-first (keystroke → the search API, no Places billing); the Google path is
  invoked ONLY from "Create new". Places session-token + `handleSelect` are byte-for-
  byte — the billing invariant is preserved (fewer Places calls than before).

## Venue library — address + capacity enrichment (feat/venue-lib-address)

> Migration 226 adds `canonical_venues.address` (facts only; NO RLS change — stays
> world-readable, service-role write). `findOrCreateCanonicalVenue` now stores
> address + capacity on create and BACKFILLS them on find (fill-only). The routing
> POST threads `r.address` + `r.venue_capacity` into the facts so a Place pick
> populates the library. Verified: node harness with an in-memory mock service client.

- **VEN-LIB-01 — create stores address + capacity.** Creating a venue from a Place
  writes name/city/country/lat/lng + `address` (formatted) + `capacity`. (Proven.)
- **VEN-LIB-02 — backfill on find.** An existing row with `address IS NULL` (predates
  226) / `capacity IS NULL` gets both backfilled on the next find — no duplicate row,
  same canonical id returned. (Proven.)
- **VEN-LIB-03 — fill-only, never overwrites.** A row that already has an
  address/capacity (e.g. hand-edited) is left untouched on find. (Proven.)
- **VEN-LIB-04 — guards + RLS.** Empty placeId/name → null, no write. Migration adds
  NO policy/grant — `canonical_venues` stays world-read / service-role-write only
  (the 214 policies are untouched; no client write path). (Proven: grep finds no RLS
  in 226; guard test writes nothing.)

## Retired

(None yet.)
