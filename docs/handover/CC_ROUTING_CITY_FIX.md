# CC — Routing city: reliable + English (the export "struggles with city"). Build. Off `main` after the venue stack merges.

Adam's routing PDF export shows two city bugs (real tour: Charlotte Sands / Simple Plan Support Fall'26):
- **Blank city ("—") on many show days** — O2 Apollo (Manchester), OVO Arena Wembley (London), Sentrum Scene
  (Oslo), Fållan (Stockholm), O2 universum (Prague) all render "—", while travel days always have a city.
- **Local-language city names where present** — København (not Copenhagen), Wien (not Vienna), München (not
  Munich), Warszawa (not Warsaw), Milano (not Milan).

**Prerequisite:** the venue-library stack (`feat/advance-venue-autofill` tip, parts 1–4) merges to `main`
first — this builds on that city-capture path. Branch `feat/routing-city` off the updated `main`.

Root cause (verified, file:line):
- `src/app/api/places/details/route.ts:53–55` — the Place Details request sends **no `languageCode`**, so
  Google returns `addressComponents` in the local language → localized city names. (The extraction chain at
  :111–117 `locality → postal_town → sublocality → admin_area_2 → admin_area_1` is already robust; the
  language is the problem, not the fallback.)
- `src/app/api/tours/[id]/routing/route.ts:129,145` — save stores `city = r.city` (client-sent) into BOTH
  `routing.city` and the canonical venue facts. `findOrCreateCanonicalVenue` (`src/lib/venues/canonical.ts`)
  is **fill-only** — it never updates city on a later find. So a venue captured with a blank/localized city
  keeps it forever.
- `src/app/api/venues/canonical/backfill/route.ts` — only LINKS unlinked free-text rows (autocomplete
  name→placeId) and passes through the row's existing `city` (:133). It never calls Place Details to derive a
  missing city, so blank cities stay blank.
- Export (`src/lib/export/routing-data.ts:148`) reads `canon?.city ?? r.city` — correct; it just needs the
  data fixed. **Do not change the export logic.**

## PART A — English at the source. Branch `feat/routing-city` off `main`.
`places/details/route.ts`: add **`languageCode=en`** to the Place Details request (Places API New supports it
as a query param). Combine with the existing `sessionToken` param — e.g. build the query with both
`languageCode=en` and (when present) `sessionToken=…`. Result: `inferredCity` + `country` come back as English
exonyms for every new pick. No billing change (same call). Verify `København → Copenhagen`, `Wien → Vienna`,
`München → Munich`, `Warszawa → Warsaw`, `Milano → Milan` on a live pick.

## PART B — Let the library normalise city (not just fill). Same branch.
Today canonical city is write-once (fill-only). Add a **deliberate city/country refresh** so an English city
can replace a stored localized/blank one:
- Add a helper (e.g. `refreshCanonicalVenueCityCountry(placeId, svc)`) that fetches Place Details
  (languageCode=en) and **overwrites** the canonical venue's `city` + `country` with the English
  `inferredCity` + `country`. This is a *deliberate normalization* — distinct from the fill-only rule in
  `findOrCreateCanonicalVenue`; keep `findOrCreate` fill-only and put the overwrite only in this refresh path.
- Confirm the pick→save path already writes `inferredCity` into `r.city` (the client reads Details before
  save). If it does, new English picks flow through unchanged; if there's a gap, close it.

## PART C — Backfill existing tours (the actual "—" fix). Same branch.
The current backfill doesn't re-derive city for already-linked venues. Add a **city backfill** (extend the
existing admin route or a sibling): for canonical venues in the workspace that have a `google_place_id` but a
**null OR non-English/localized** city, call Place Details (languageCode=en) and write the English
`inferredCity` + `country` via the Part-B refresh. Also fill `routing.city` where it's blank from the linked
canonical venue. Admin-gated, rides the `guardGoogleCall` google rate lane, logs each call, idempotent /
re-runnable, capped per run (mirror the existing backfill's `MAX_NAMES_PER_RUN`). Adam runs it once.

## PART D — Verify on the real tour.
After A+B+C and running the backfill, re-export the Charlotte Sands routing PDF and confirm the CITY column:
the five blanks resolve (Manchester, London, Oslo, Stockholm, Prague) and the localized names normalize to
English. Report the before/after city list. Smoke `ROUTE-CITY-01..` (unit: inferredCity English from a
sample Details payload; backfill fills a null-city linked venue; export row shows the English city).

## Flags
- **Sub-locality judgment (note, don't over-build):** if a backfilled city still lands on a sub-district
  (e.g. "Johanneshov" for Stockholm, "Praha 9-Libeň" for Prague), prefer the metro. The English `locality`
  usually IS the metro (the localized ones already were), so most resolve cleanly — but list any that don't so
  Adam can decide, rather than hard-coding a mapping.
- **Cost:** Part C makes billable Place Details calls (one per distinct unresolved venue), rate-limited +
  admin-run once. Parts A/B add no calls.
- No migration expected (city/country columns exist on both tables). If you think one's needed, STOP and flag.

## Hard rules
Branch off `main` (after the venue stack merges). Tokens/RLS unchanged; `canonical_venues` stays world-read /
service-role-write; the export logic is untouched (data-only fix). Commit + PUSH, confirm
`git log origin/feat/routing-city`, report the before/after CITY column from the re-exported PDF.
