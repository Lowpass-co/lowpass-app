# Canonical Venues — Discovery report (Phase D)

**Date:** 2026-06-25 · **Ticket:** CC_VENUE_CANONICALIZATION (Layer C floor)
· **Status:** ⚠️ FOR ADAM TO REVIEW before any migration is written (Hard
Rule #2). This report is the contract for Phase M.

> TL;DR — There is exactly **one** clean place to capture venue identity
> (`VenueAutocomplete`), and the Google `place_id` is **already fetched
> there and then thrown away**. The per-workspace `venues` table is a red
> herring: it is **never written by application code**, so `routing.venue_id`
> is effectively always NULL and the real venue identity is the free-text
> `routing.venue_name`. The floor should therefore anchor on
> **`routing.canonical_venue_id`**, with `venues.canonical_venue_id` as a
> secondary (mostly-unused) link.

---

## 1. How a venue attaches to a routing row today

### The flow
1. In the routing grid/calendar, the venue cell is `<VenueAutocomplete>`
   ([src/components/routing/VenueAutocomplete.tsx](../../src/components/routing/VenueAutocomplete.tsx)).
2. As the user types, it calls `POST /api/places/autocomplete`
   ([route](../../src/app/api/places/autocomplete/route.ts)), which returns
   `{ suggestions: { placeId, text }[] }` — **the Place ID is present here.**
3. On pick, `handleSelect(placeId, text)` calls
   `GET /api/places/details?placeId=…`
   ([route](../../src/app/api/places/details/route.ts)) for name/address/
   city/country/lat/lng/phone/website, then calls
   `onPlaceSelect(result: VenuePlaceResult)`.
4. **`VenuePlaceResult` does NOT include `place_id`** (L14-25 of
   VenueAutocomplete). The two consumers —
   [RoutingGrid L355](../../src/components/routing/RoutingGrid.tsx) and
   [RoutingCalendar L283](../../src/components/routing/RoutingCalendar.tsx) —
   write `venue_name`, `city`, `lat/lng`, `venue_website`, `venue_phone`,
   `venue_capacity`, `address` onto the routing row. **The `place_id` is
   discarded between step 2 and step 4.**
5. The row saves via `POST /api/tours/[id]/routing` (bulk) or
   `PATCH /api/tours/[id]/routing/[routingId]`. Persisted venue fields:
   `venue_id, venue_name, venue_website, venue_phone, venue_capacity,
   address, latitude, longitude` (routing `[routingId]` ALLOWED_FIELDS,
   L18-31).

### Where `venue_name` comes from when `venue_id` is null
Almost always: the typed/picked text in `VenueAutocomplete` → `venue_name`.
`venue_id` is in the API's allow-list but is **dead in practice** (see §2).

### Other venue entry points (NOT identity chokepoints)
- `VenueIntakeForm` ([component](../../src/components/advance/VenueIntakeForm.tsx))
  — the public advance form. It is handed `show.venueName` (already-named
  routing row) and collects the venue's *answers*; it does not pick a Place.
  Downstream of identity, not a capture point.
- `PlacesAutocompleteInput` (spreadsheet-view) — used by HotelsGrid /
  FlightsGrid for **hotels/airports**, not routing venues. Same place_id-
  discarded pattern, but out of scope for venue identity.

**Conclusion for Phase W:** there *is* a single clear chokepoint —
`VenueAutocomplete`. The capture fix is small: thread the `place_id`
(already in `handleSelect`) through `VenuePlaceResult` → both consumers →
the routing write API → find-or-create `canonical_venues`. No consolidation
of entry points is needed first.

---

## 2. The `venues` table is never written (important)

A repo-wide search for any write to `public.venues`
(`from('venues')` with insert/update/upsert/delete across `src/`,
`scripts/`, `src/server/`) returns **nothing**. `venues` is only ever READ
([budget/rules-check](../../src/app/api/budget/rules-check/route.ts),
[rag reindex](../../src/lib/ai/rag/reindex.ts)) and surfaced on the
read-only [/venues page](../../src/app/(app)/venues/page.tsx).

Implications:
- `routing.venue_id` (FK → `venues`, migration 001 L110/L187) is a nullable
  FK that the UI **does not populate** — there are no `venues` rows to point
  at. The live venue identity is `routing.venue_name` (free text) plus the
  denormalised `venue_website/phone/capacity` (migration 015) and
  `latitude/longitude` (migration 009) **on the routing row itself**.
- So the ticket's mental model ("each workspace re-types Ally Pally as its
  own `venues` row") is half-right: the duplication is real, but it lives in
  **`routing.venue_name` strings**, not `venues` rows.
- **Therefore the primary link is `routing.canonical_venue_id`.**
  `venues.canonical_venue_id` is still worth adding (additive, cheap, future-
  proof) but will be mostly empty until/unless `venues` starts being written.

---

## 3. Does anything already store a Place ID? — No.

`grep place_id|placeId` across migrations: **zero**. No column anywhere
stores a Place ID. In code, `placeId` appears only transiently in the two
autocomplete components and is dropped before persistence. The Places
*response* (including `placeId`) is fetched on every venue pick and
**discarded** — we already pay for the call; we just don't keep the key.

---

## 4. Dirty-data assessment (SQL for Adam — I can't query prod)

Run these to size the backfill before Phase M/B:

```sql
-- Routing rows: how venue identity is currently held
SELECT
  count(*)                                            AS total_rows,
  count(*) FILTER (WHERE venue_id IS NOT NULL)        AS has_venue_id,      -- expect ~0
  count(*) FILTER (WHERE venue_id IS NULL
                     AND nullif(trim(venue_name),'') IS NOT NULL) AS name_only,
  count(*) FILTER (WHERE venue_id IS NULL
                     AND nullif(trim(venue_name),'') IS NULL)     AS neither
FROM public.routing;

-- Distinct free-text venue names (the dedupe target) + how often each repeats
SELECT lower(trim(venue_name)) AS norm_name, count(*) AS rows, count(DISTINCT tour_id) AS tours
FROM public.routing
WHERE nullif(trim(venue_name),'') IS NOT NULL
GROUP BY 1 ORDER BY rows DESC LIMIT 50;

-- How many workspace `venues` rows actually exist (expect low / legacy only)
SELECT count(*) AS venue_rows, count(*) FILTER (WHERE capacity IS NOT NULL) AS with_capacity
FROM public.venues;

-- Cross-workspace overlap teaser: same normalised name across workspaces
SELECT lower(trim(r.venue_name)) AS norm_name, count(DISTINCT t.workspace_id) AS workspaces
FROM public.routing r JOIN public.tours t ON t.id = r.tour_id
WHERE nullif(trim(r.venue_name),'') IS NOT NULL
GROUP BY 1 HAVING count(DISTINCT t.workspace_id) > 1
ORDER BY workspaces DESC LIMIT 30;
```

The last query is the proof-of-value: rows where the *same* venue name
appears across *multiple* workspaces are exactly what canonical IDs unify.

---

## 5. Columns: canonical facts vs workspace-private

Per [DATA_MAP.md](../gdpr/DATA_MAP.md) §3c + §6:

| Source | Canonical-fact candidates (non-personal) | Workspace-private / personal — STAY PUT |
|---|---|---|
| `venues` | `name`, `city`, `country`, `capacity`, (`address`) | `contacts` (JSONB **people** — F4), `notes`, `hospitality_info`, `parking_info`, `union_rules`, `technical_specs` |
| `routing` | `venue_name`→name, `city`, `latitude`, `longitude`, `venue_capacity` | `venue_phone` (may be a person — DATA_MAP §3c), `notes`, `address` (treat as workspace) |

The canonical row carries **only** the left column. `venue_phone`,
`contacts`, `notes` never go near `canonical_venues`.

⚠️ **Capacity is the one borderline fact.** Google Places does **not**
return capacity, so the only capacity we have is workspace-entered
(`routing.venue_capacity` / `venues.capacity`). Writing it to a shared
table means workspace A's estimate becomes workspace B's "the capacity."
It's not personal data and venue capacity is largely public, so this is
low-risk — but it is the one place tenant-derived data would enter the
shared table. **Decision needed (D-3 below).**

---

## 6. Proposed `canonical_venues` shape + the RLS seam

### Shape (matches the ticket; capacity gated by D-3)
```sql
CREATE TABLE public.canonical_venues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE,           -- cross-tenant dedupe key (nullable: manual rows allowed)
  name            text NOT NULL,
  city            text,
  country         text,
  capacity        integer,               -- see D-3
  lat             double precision,
  lng             double precision,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venues  ADD COLUMN canonical_venue_id uuid REFERENCES public.canonical_venues(id) ON DELETE SET NULL;
ALTER TABLE public.routing ADD COLUMN canonical_venue_id uuid REFERENCES public.canonical_venues(id) ON DELETE SET NULL;
```
There is **no `workspace_id`** on `canonical_venues` — that is the
invariant that keeps the seam safe. The table must NEVER carry tenant data.

### The RLS seam (architecture doc §3) — recommended
- **`canonical_venues` SELECT → any authenticated user.** These are
  non-personal real-world facts (like a public venue directory); find-or-
  create needs to read existing rows across tenants. No `workspace_id`, no
  mapping, nothing private on the row → no leak vector.
- **`canonical_venues` INSERT/UPDATE → service-role only** (mirror
  `rag_chunks` / `ai_usage_events`, migration 114). The find-or-create runs
  **server-side** inside the routing write route and the backfill, using the
  service client. No client ever writes canonical rows → can't poison or
  enumerate-by-injection. (Recommended over "authenticated insert of facts
  only" — simpler to reason about, one write path.)
- **The mapping stays private automatically.** `venues.canonical_venue_id`
  and `routing.canonical_venue_id` are columns on already-workspace-scoped
  tables; their existing RLS (`workspace_id = get_my_workspace_id()`) gates
  the whole row, so "which workspace played where" never leaks. A user
  reading `canonical_venues` learns *that* Ally Pally exists (public), never
  *who* played it.

This preserves the rule: **facts shared, mapping private.** Cross-workspace
isolation (a user reading another workspace's `routing`/`venues`) is
unchanged because those policies are untouched.

### Place ID refresh path (document, don't build)
Store `google_place_id`; allow re-resolve. Google occasionally retires/
merges IDs. A future maintenance job can re-query Places for a stored ID,
and on a "moved"/merged response, repoint. Not built now; the `UNIQUE`
nullable column + service-role updates make it possible later.

---

## 7. Decisions needed from Adam before Phase M

- **D-1 — RLS call.** Confirm `canonical_venues` SELECT = any authenticated
  user, writes = service-role only (§6). This is the seam; I will not guess
  it (Hard Rule #4).
- **D-2 — Primary link.** Confirm the floor anchors on
  `routing.canonical_venue_id` (since `venues` is unwritten), with
  `venues.canonical_venue_id` added but secondary. (Phase W hooks the
  routing save; Phase B backfills `routing` first.)
- **D-3 — Capacity.** Include `capacity` on `canonical_venues` but **leave
  it NULL in this floor** (don't backfill tenant-entered capacity into the
  shared table), or populate it last-writer-wins from workspace data?
  Recommend: include the column, leave NULL for now, revisit when a neutral
  capacity source exists.
- **D-4 — Backfill confidence bar.** For Phase B, auto-link only exact /
  high-confidence Places matches; everything ambiguous → a review list
  (path TBD, e.g. `docs/handover/VENUE_CANON_REVIEW_<date>.md` or a
  `canonical_venue_candidates` table). Confirm you want a doc list vs a
  table for the review queue.

---

## 8. Phase plan implied by this discovery (for M onward, post-approval)

- **M** — migration `213_canonical_venues.sql` (next free ≥ 213; verify
  across branches at write time): table + two nullable FK columns + RLS per
  §6 + down-block.
- **W** — add `place_id` to `VenuePlaceResult`; thread through RoutingGrid +
  RoutingCalendar → routing write API; one server helper
  `findOrCreateCanonicalVenue(placeId, facts)` (service-role upsert by
  `google_place_id`) sets `routing.canonical_venue_id`.
- **B** — backfill script: distinct `routing.venue_name` (+city) → Places
  resolve → high-confidence auto-link, ambiguous → review list. Idempotent,
  never overwrites an existing `canonical_venue_id`.
- **V** — two workspaces → same real venue → same `canonical_venues.id`;
  isolation re-verified; smoke IDs.
