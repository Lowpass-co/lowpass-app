# Canonical Venues — the Community prerequisite (Layer C floor)

> The headline vision ("9/10 tour managers who play Alexandra Palace rent a PA, +$15k") is **impossible on today's schema**: `venues` is workspace-scoped (each workspace re-types "Ally Pally" as its own row) and `routing.venue_id` is a *nullable* FK with a free-text `venue_name` escape hatch. There is no shared, real-world venue identity to aggregate across tenants. This ticket builds that identity layer.
>
> **Scope of THIS ticket: the floor only** — a global canonical-venue identity anchored on Google Place ID, plus reliable `routing → canonical venue` links and a backfill. It does **NOT** build the cross-workspace aggregation / "9/10" statistics — that's a later, **opt-in + k-anonymity + reciprocity** build (the "Community"), which sits on top of this. Do not pool any cross-workspace data here.
>
> Pattern to mirror: the in-flight **personnel unification (migration 204)** did exactly this shape for people (`canonical_persons` spine). Venues need the same, plus a *global* layer that people deliberately never get.

---

## 0. Required reading
1. `CLAUDE.md` (esp. migration numbering, RLS helpers, "ask when uncertain")
2. `docs/handover/AI_ASSISTANT_ARCHITECTURE.md` — §3 (the canonical-venue-via-Place-ID plan + the RLS seam) and §2 Layer C
3. `database/migrations/001_initial_schema.sql` — `venues` (L165) + `routing` (L104, note `venue_id` nullable FK + `venue_name` free text)
4. Migration **204** (personnel unification) — the canonicalisation pattern to follow
5. `src/app/api/places/nearby/route.ts` + `src/lib/google/*` — the Google Places integration already in the stack (this is the dedupe key source)
6. `database/migrations/README.md` — numbering (next free ≥ highest across ALL active branches)
7. `docs/data-model/` — any existing venue/routing schema docs
8. `docs/gdpr/DATA_MAP.md` — `venues.contacts` (JSONB people) + `routing.venue_phone/notes` are personal; canonical venue facts (name/place_id/capacity/city/country) are NOT. Keep the line clean.

## 1. Hard rules
1. No new dependencies. No `any`/`@ts-ignore`. Tokens via `var(--lp-…)`. Lint clean, `tsc` zero, build `next build --webpack`.
2. **Discovery before SQL** (Phase D). CC produces a discovery report and Adam reviews it before any migration is written. Do not write the migration first.
3. **Additive + reversible.** New table + new nullable FK columns only. Do NOT drop or repurpose existing `venues`/`routing.venue_id`/`venue_name` in this ticket. Existing per-workspace `venues` rows stay; they gain a *link* to the canonical row.
4. **The RLS seam is the whole game** (architecture doc §3): canonical venue *facts* (name, place_id, city, country, capacity) may be world-readable to authenticated users; the *mapping of which workspace played where* and any aggregate must stay workspace-scoped / gated. Get this wrong and one promoter can read another's routing. If the right boundary is unclear, STOP and ask Adam — do not guess.
5. **Out of scope (do not build):** cross-workspace aggregation, k-anonymity logic, the "Community" opt-in, any "9/10" statistic. This ticket only creates the identity + links.
6. Commits in order: **D (discovery report) → M (migration) → W (wire capture) → B (backfill) → V (verify).**

---

## D — Discovery (read-only; Adam reviews before M)
Produce `docs/handover/VENUE_CANON_DISCOVERY_<date>.md` answering:
- Every place `routing.venue_id` and `routing.venue_name` are read/written (grep). How does a venue actually get attached to a routing row today — is there Places autocomplete anywhere (advance `VenueIntakeForm`, routing grid, venue create)? Where does `venue_name` come from when `venue_id` is null?
- Does any table already store a Google `place_id`? (Search migrations + code.) If Places is used, where does the response (incl. `place_id`) currently go — is it discarded?
- How dirty is the data: rough counts of routing rows with `venue_id` set vs only `venue_name` (provide the SQL for Adam to run if you can't query).
- The `venues` columns that are real-world venue *facts* (canonical candidates) vs workspace-private (contacts/notes — stay put).
- Proposed `canonical_venues` shape + the exact RLS split (facts vs mapping). **This report is the contract for M.**

---

## M — Migration: `canonical_venues` + links
After Adam approves the discovery report. Next free number (verify across branches per README; mirror in header; idempotent; down-block).

Shape (adjust per discovery):
```sql
-- Global, platform-scoped venue identity (NOT workspace-scoped).
CREATE TABLE IF NOT EXISTS public.canonical_venues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE,            -- the cross-tenant dedupe key
  name            text NOT NULL,
  city            text,
  country         text,
  capacity        integer,
  lat             double precision,
  lng             double precision,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Link existing per-workspace venues to the canonical row:
ALTER TABLE public.venues       ADD COLUMN IF NOT EXISTS canonical_venue_id uuid REFERENCES public.canonical_venues(id) ON DELETE SET NULL;
-- And routing directly (so a routing row resolves to a real-world venue even if no workspace `venues` row exists):
ALTER TABLE public.routing      ADD COLUMN IF NOT EXISTS canonical_venue_id uuid REFERENCES public.canonical_venues(id) ON DELETE SET NULL;
```
RLS (the seam):
- `canonical_venues`: RLS on. SELECT allowed to any authenticated user (these are non-personal real-world facts) — confirm this matches Adam's call in discovery. INSERT/UPDATE via service-role only (rows are created/refreshed by the capture + backfill paths, not arbitrary client writes), OR a tightly-scoped authenticated insert that only sets facts. **No workspace data on this table**, so no leak vector — but document the reasoning.
- `venues.canonical_venue_id` / `routing.canonical_venue_id`: covered by those tables' EXISTING workspace-scoped policies — the mapping stays private. Verify the existing policies still gate the new columns (they do, since they gate the row).

Note: Google Place IDs can occasionally be retired/merged — document a refresh path (store `place_id`, allow re-resolve) but don't build auto-refresh now.

---

## W — Wire: capture Place ID going forward
- Wherever a venue is chosen for a routing row (per discovery — routing grid and/or `VenueIntakeForm`), use the existing Places autocomplete to capture `place_id` + name/city/country/lat/lng.
- On selection: `upsert` `canonical_venues` by `google_place_id` (find-or-create), set `routing.canonical_venue_id` (and the workspace `venues.canonical_venue_id` if a `venues` row is involved). One helper, reused.
- Keep `venue_name` populated too (display/back-compat). This is additive — nothing that works today breaks.

---

## B — Backfill existing rows
- For existing `venues` / `routing` rows that have a name but no `canonical_venue_id`: resolve name (+ city) → Place ID via Places, create/link `canonical_venues`.
- **Ambiguous matches need human confirmation** — do NOT auto-link low-confidence matches (that's how "Ally Pally" and "Alexandra Palace, North Greenwich" wrongly merge or split). Produce a review list for Adam for anything below a confidence bar; auto-link only exact/high-confidence.
- Idempotent + re-runnable; never overwrite an existing `canonical_venue_id`.

---

## V — Verify
- [ ] `tsc`/lint/build clean; migration applies idempotently via `npm run db:migrate`.
- [ ] Two different workspaces that both play the same real venue now point at the **same** `canonical_venues.id` (the whole point).
- [ ] Cross-workspace isolation intact: a user still cannot read another workspace's `routing`/`venues` rows — only the shared canonical *facts*. (Re-run an isolation check.)
- [ ] New routing entries via the UI capture `place_id` and link the canonical row.
- [ ] Backfill linked the unambiguous rows; ambiguous ones are in a review list, not silently merged.
- [ ] Smoke IDs added under `docs/smoke-tests/` (venue or a new file): canonical-link-on-create, cross-workspace-same-venue-same-id, isolation-still-holds.

## When done
```
Canonical venues foundation done.
- canonical_venues (global, google_place_id-keyed) + venues/routing.canonical_venue_id links (migration NNN).
- RLS: canonical facts readable to authed users; workspace mapping stays private (seam per architecture doc §3).
- Places capture wired on <routing entry / VenueIntakeForm per discovery>; find-or-create on place_id.
- Backfill: high-confidence rows linked; ambiguous in review list at <path>.
- Isolation re-verified. Discovery report at docs/handover/VENUE_CANON_DISCOVERY_<date>.md.
- NOT built (by design): cross-workspace aggregation / k-anonymity / Community — separate opt-in ticket.
- Adam: apply migration NNN; run backfill; clear the ambiguous-match review list.
```
If discovery shows venue selection has no single chokepoint (venues attached many different ways), surface that — the capture step (W) depends on there being a clear place to hook, and we may need to consolidate that first.
