# Google Maps cost hardening — cache directions, session-token autocomplete, fix the estimate

> **Why now (not a fire):** at current volume the real Google charge is ~$0 — since **1 March 2025** Google replaced the pooled $200/mo credit with **per-SKU monthly free tiers** (10,000 free calls/mo for Essentials SKUs, which Directions and Places Autocomplete both are). The usage dashboard's costs are Lowpass's **internal list-price estimates**, not the invoice. **But** the free tier is **per billing account, not per workspace** — at scale (hundreds/thousands of workspaces) routing grids and venue typing will blow past 10k/SKU/mo and start billing. Two call patterns scale badly, and the dashboard hides one of them. Fix while it's cheap.
>
> Observed (usage dashboard, internal estimate): `google.directions` 184 calls = top line; `google.places.autocomplete` 202 calls shown at **$0.0005/call** which is ~5× too low vs Google's ~$0.00283/call Autocomplete-Per-Request SKU — so the dashboard *under-reports* autocomplete.

---

## 0. Required reading
1. `CLAUDE.md`
2. `src/app/api/directions/route.ts` — Directions proxy (calls `guardGoogleCall('google.directions')`)
3. `src/components/routing/RoutingGrid.tsx` (~L149) — the caller; fetches `/api/directions` per leg. **Establish in discovery whether it re-fetches on every grid load/render** (184 calls strongly implies no cache).
4. `src/app/api/places/autocomplete/route.ts` + `src/app/api/places/details/route.ts` — Places proxies
5. `src/components/routing/VenueAutocomplete.tsx` + `src/components/spreadsheet-view/PlacesAutocompleteInput.tsx` — already **debounced** (keep that); **no session tokens today** (grep `sessiontoken` → none)
6. `src/lib/google/pricing.ts` + `src/lib/external/googleUsage.ts` — the per-SKU cost estimates + the request guard/limiter (this is where the $0.0005 estimate lives)
7. Google's current SKU pricing — **verify live before changing the estimate table** (prices change): developers.google.com/maps/billing-and-pricing/overview

## 1. Hard rules
1. No new dependencies. No `any`/`@ts-ignore`. Tokens via `var(--lp-…)`. Lint clean, `tsc` zero, build `next build --webpack`.
2. **Don't change behaviour the user sees** — drive times and autocomplete must work exactly as now; this is purely fewer/cheaper calls.
3. Verify every price you put in the estimate table against Google's **current** published SKU pricing at build time; cite the figure + date in a code comment. Do not hardcode a number you didn't check.
4. Commit order: **D (discovery) → F1 directions cache → F2 session tokens → F3 estimate fix → V.**

---

## D — Discovery (read-only, brief)
Confirm and write into the done report:
- Exactly when `RoutingGrid` fires `/api/directions` — on mount, on every render, per visible row, on data change? How many legs per routing on average? (This sizes the saving.)
- Whether any drive-time result is persisted today (a column on `routing`? a client memo that dies on reload?).
- The autocomplete → details flow: does selecting a suggestion call Place Details? (It should, for the canonical-venue Place ID capture that just shipped.) That details call is what a session token bundles with the keystroke requests.

## F1 — Cache directions (the biggest real saving at scale)
A drive time between two fixed points is **deterministic and ~never changes**. Stop re-fetching it.
- Add a cache keyed on `(origin, destination, mode)` — preferred: a small `drive_time_cache` table (workspace-agnostic is fine; the inputs are public place strings/coords, not personal) OR reuse an existing cache layer if one exists (discovery). Store `duration_seconds` + `distance_meters` + `fetched_at`.
- `/api/directions` checks the cache first; only calls Google on a miss; writes the result back. Optional TTL (e.g. 90 days) so a road change eventually refreshes — but default to "cache forever until invalidated," since legs are stable.
- `RoutingGrid` should also not re-request a leg it already has in component state on re-render.

### F1 acceptance
- [ ] Opening the same routing grid twice makes **zero** new `google.directions` calls the second time (verify in the usage dashboard / Network tab).
- [ ] A brand-new leg still computes once and caches.

## F2 — Places session tokens (correctness + scale cost)
Without a session token, Google bills each debounced Autocomplete request **and** the final Place Details separately. A session token bundles the whole typing session + the one Details lookup into a single billed session.
- Generate one `AutocompleteSessionToken` (a UUID is fine for the web service) **per typing session** in `VenueAutocomplete` / `PlacesAutocompleteInput`; reuse it across the debounced autocomplete requests; pass the **same** token to the Place Details call when the user picks a result; then discard it (new token next time the field is focused/cleared).
- Thread the token through `/api/places/autocomplete` and `/api/places/details` (add a `sessiontoken` param, forward to Google).
- Keep the existing debounce + min-length. (Debounce reduces request count; session token reduces what each session is billed as — both matter.)

### F2 acceptance
- [ ] One venue lookup (type + pick) registers as a single Places **session** to Google, not N autocomplete requests + a separate details charge. (Confirm against the real Google billing console, not the internal estimate.)
- [ ] Place ID capture for canonical venues still works (details still returns place_id).

## F3 — Make the dashboard estimate honest
- Correct the `google.places.autocomplete` per-call figure in `pricing.ts` to Google's **current** Autocomplete SKU price (≈$0.00283/req at last check — **verify live**), so the usage dashboard stops under-reporting ~5×.
- Audit the other Google SKU estimates (directions, geocode, place details) against current pricing while you're in there; `directions ≈ $0.005` and `details ≈ $0.017` looked right but confirm.
- Add a code comment noting these are **list-price estimates for capping/visibility**, and that the **per-SKU free tier (10k/mo Essentials, since 2025-03-01)** means real charges are typically $0 until a SKU exceeds its free cap. Consider surfacing "X of 10,000 free this month" in the usage view (nice-to-have, not required).

### F3 acceptance
- [ ] Autocomplete line in the usage dashboard reflects the corrected per-call price.
- [ ] Comment documents list-estimate vs real-bill + the per-SKU free tier.

## V — Verify
- [ ] `tsc`/lint/build clean.
- [ ] Directions: second load of a routing = 0 new calls; new leg = 1 call then cached.
- [ ] Autocomplete: a lookup is one session to Google; details/place_id still work.
- [ ] Reconcile the dashboard totals against the **actual Google Cloud billing console** for the period and note the gap in the done report (internal estimate vs invoice).
- [ ] Smoke IDs added under `docs/smoke-tests/` (ai-usage or a maps-cost file): directions-cache-hit, autocomplete-single-session, estimate-matches-google.

## When done
```
Google Maps cost hardening done.
- F1: drive times cached per (origin,destination,mode) — re-opening a routing
  makes zero new directions calls. Files: api/directions/route.ts (+cache),
  RoutingGrid.tsx (state reuse), migration NNN if a cache table was added.
- F2: AutocompleteSessionToken threaded through autocomplete + details so each
  venue lookup bills as one Places session, not N requests + a details charge.
  Debounce kept. place_id capture unaffected.
- F3: corrected the autocomplete per-call estimate in pricing.ts (was ~5x low);
  documented list-estimate-vs-invoice + the 2025 per-SKU free tier.
- Reconciled dashboard vs real Google bill: <gap noted>.
- Adam: apply migration NNN if a cache table was added.
```
If discovery shows directions is already cached somewhere (so 184 calls came from genuinely-distinct legs), say so — then F1 shrinks to just the component-state reuse and we focus on F2/F3.
