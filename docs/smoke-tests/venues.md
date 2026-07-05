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

## Venue SSOT — resolve + freeze (migration 237, `resolveVenue`)

> Prereq: migration 237 applied (`routing.venue_frozen_at` exists). VEN-01..05
> cover canonical LINKING; these cover RESOLUTION (live-vs-frozen) + freeze +
> the /venues edit surface. Scripted proof (no DB):
> `node --experimental-strip-types src/lib/venues/resolveVenue.harness.ts`
> → "18 checks passed, 0 failed".

#### VEN-06 — Editing a canonical venue flows to upcoming shows

**Do**: On `/venues`, edit a venue (name/address/capacity) that an **upcoming**
(future-dated) routing row references. Reload that tour's routing.

**Expect**: The upcoming row shows the edited venue (routing GET resolves live
from canonical). The `/venues` editor showed "N upcoming shows reference this
venue" and listed them before saving.

**Last verified**:

#### VEN-07 — A past/frozen show does NOT change

**Do**: Same edit as VEN-06, but check a **past** routing row (date < today) that
referenced the same venue.

**Expect**: The past row keeps its original venue snapshot — the edit does not
rewrite history. The past show is not in the editor's propagation list.

**Last verified**:

#### VEN-08 — Live advance render reflects the edit

**Do**: Open the advance for an **upcoming** show whose venue you just edited.

**Expect**: The advance venue block shows the edited value while the day is live
(resolved from canonical), not the older captured value.

**Last verified**:

#### VEN-09 — On-read freeze snapshots after the day passes

**Do**: For a routing row whose show day has just passed (canonical-linked,
`venue_frozen_at` still NULL), load the tour's routing (any consumer of the
routing GET). Then edit the canonical venue on `/venues` and reload.

**Expect**: The first load after the date passed wrote `venue_frozen_at` and
snapshotted the canonical values into `routing.venue_*` (freeze happens in
`resolveRoutingVenues` → `freezePassedVenues`, in
`src/app/api/tours/[id]/routing/route.ts` GET). After freezing, the later
canonical edit does NOT change that row.

**Last verified**:

#### VEN-10 — Exports resolve live/frozen (documents that leave the building)

**Do**: Edit a canonical venue on `/venues` (change its name/address). Then, for
an **upcoming** show linked to that venue, regenerate each export that carries a
venue: routing export (list/calendar), payroll export with "venue per day",
budget P&L export (per-show income detail), and the advance packet (PDF +
public share link). Then check a **past/frozen** show linked to the same venue.

**Expect**: The **upcoming** show's exports show the EDITED venue (resolved from
canonical). The **past/frozen** show's exports show the SAVED SNAPSHOT — the edit
does NOT rewrite history (the bug this closes: a past show linked to a
later-renamed canonical row used to export the current name). No export writes to
the DB — the freeze write stays in the routing GET; exports resolve read-only
(the public packet uses the service client, so it resolves too).

Every export venue value now flows through `resolveVenue()` — the ad-hoc
`canon?.name ?? r.venue_name` frozen-unaware fallbacks are gone
(`src/lib/export/{routing,payroll,budget}-data.ts`,
`src/lib/advance-packet/manifest.ts`). Scripted proof (the exact resolver the
export loaders call): `node --experimental-strip-types
src/lib/venues/resolveVenue.harness.ts` → "18 checks passed" (case 1
upcoming→canonical, case 2 past→snapshot).

**Last verified**:

## Known broken

(None yet.)

## Routing city — reliable + English (feat/routing-city)

> The routing PDF showed blank cities ("—" on O2 Apollo/Manchester, OVO Wembley/
> London, Sentrum Scene/Oslo, Fållan/Stockholm, O2 universum/Prague) and localized
> names (København, Wien, München, Warszawa, Milano). Three data-only fixes (export
> logic UNCHANGED). No migration (city/country columns already exist).
>
> **A — English at the source:** `places/details/route.ts` now sends `languageCode=en`
> (+ the session token) → addressComponents come back as English exonyms. Same call,
> no billing change.
> **A2 — blank-city gap closed:** `VenueAutocomplete` wrote raw `d.locality` (blank for
> venues with no `locality`, e.g. UK `postal_town` like Manchester); now uses the
> route's robust `d.inferredCity ?? d.locality` (locality → postal_town → sublocality
> → admin_area).
> **B — deliberate normalization:** `refreshCanonicalVenueCityCountry(placeId, svc)`
> fetches Details (en) and OVERWRITES canonical city+country (distinct from the
> fill-only `findOrCreateCanonicalVenue`). Shared `placeCity.ts` (`extractCityCountry` +
> `fetchPlaceCityCountry`).
> **C — backfill:** `POST /api/venues/canonical/backfill-city` (admin-gated, rides the
> google rate lane, logs each call, capped 200/run, re-runnable): refresh each distinct
> linked venue's city→English, then fill `routing.city` where blank from the linked
> canonical.

- **ROUTE-CITY-01..06 (unit, node harness on `extractCityCountry`):** locality →
  metro; **postal_town fallback resolves Manchester (was blank)**; locality beats
  sublocality (Stockholm over Johanneshov); sublocality only when no locality/
  postal_town (Praha 9-Libeň — flagged as a district); the five localized→English
  cases (Copenhagen/Vienna/Munich/Warsaw/Milan) resolve; empty → null. (All proven.)
- **ROUTE-CITY-07 — Adam's live verification (Part D):** with `GOOGLE_PLACES_API_KEY`
  set, as a workspace admin `POST /api/venues/canonical/backfill-city` once, then
  re-export the Charlotte Sands / Simple Plan Support Fall'26 routing PDF and read the
  CITY column. **Expected before → after:**
  - O2 Apollo — — → **Manchester** · OVO Arena Wembley — — → **London** · Sentrum
    Scene — — → **Oslo** · Fållan — — → **Stockholm** · O2 universum — — → **Prague**
  - København → **Copenhagen** · Wien → **Vienna** · München → **Munich** · Warszawa →
    **Warsaw** · Milano → **Milan**
  - The backfill JSON reports `refreshed`, `routing_city_filled`, and `review_examples`
    (any city that still looks like a district — e.g. contains a digit/hyphen — for
    Adam to eyeball; the metro `locality` usually resolves cleanly).
  (Headless can't auth + call Google + re-export — this is Adam's one live run.)

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
