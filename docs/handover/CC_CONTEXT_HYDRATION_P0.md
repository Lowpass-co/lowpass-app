# CC — P0: ArtistTourContext never hydrates from the tour URL. SINGLE OWNER. Do this BEFORE the artist builder.

Cowork walked deployed `f3b7d3f` (dpl_BusoobTtxUoT1zjsQKrYtzcbY2Pv) on 2026-07-19 at 3440×1323. G2-2b and G2-4 verified PASS (numbers below). This is the one thing that failed, and it is almost certainly ONE root cause behind three separately-reported symptoms.

## Symptom 1 — `/operations/[tourId]/personnel` hangs forever
Reproduced three times, waited 30+ seconds on the last run. Page renders chrome (nav, identity band, section tabs, "Personnel" title) then sits on "Loading personnel…" permanently. `document.body.innerText.length` stays at 201 chars.

**The decisive evidence: there is NO data request at all.** Full network capture for the page load is 109 requests — the document (200), fonts, CSS, JS chunks including `app/(app)/operations/[tourId]/personnel/page-bd754aedeed1a32b.js` (200), the Spotify avatar (200), manifest, icons. **Zero `/api/*` calls. Zero `*.supabase.co` calls. Zero console errors.**

So this is NOT a slow query, NOT a failing fetch, NOT an error being swallowed. **The loader is never invoked.** The component mounts in its loading state and nothing ever kicks off the request. Look for an early return or an effect gated on a value that is never truthy — `if (!artistId) return;`, a `useEffect` dep that never changes, a `useQuery({ enabled: … })` that is never enabled, or a Suspense boundary awaiting a promise that is never created.

Note G2-1b#3 reported this fixed by removing the blocking `resolveArtistLogoUrl`. That fixed the *layout* stall. This is a different, still-live failure — the page loads fast now and then does nothing. Root-cause it in one sentence in your report.

## Symptom 2 — the artist picker reads "Pick an artist…" on every tour page
On `/operations/[tourId]/personnel`, `/payroll`, `/channel-list`, `/stage-plot`, `/riders` and `/budget/[tourId]`, the top-bar picker shows the placeholder **"Pick an artist…"** — while the identity band directly beneath it correctly renders "Charlotte Sands · Simple Plan Support | Fall'26 · Upcoming" from server props.

The server knows the artist. The client context does not. The band works precisely because it is fed by server props (`artistName`/`avatarUrl`/`tourName`/`statusLabel` — confirmed in the RSC payload) and does NOT depend on `ArtistTourContext`.

**Hypothesis to test first (moderate-to-high confidence): `ArtistTourContext` is never hydrated from the tour in the URL.** It initialises empty and only populates when the user manually picks an artist. Anything gated on it is dead on a cold load — which would explain Symptom 1 exactly, and explains Symptom 3.

## Symptom 3 — the artist builder's "Next only works after you switch the selected artist"
Adam's original report, now spec'd in `CC_ARTIST_BUILDER.md`. Same shape: a control gated on ambient context that is empty until something else forces it to populate.

## What to do
1. **Find the truth.** Read `src/contexts/ArtistTourContext.tsx` and every consumer. Determine whether it hydrates from route params / server props on mount, or only from user interaction. Report what you find BEFORE changing anything — if the hypothesis is wrong, say so and root-cause Symptom 1 on its own terms.
2. **If the hypothesis holds:** hydrate the context from the route on mount — inside `/operations/[tourId]/*`, `/budget/[tourId]/*`, `/advance/[tourId]/*` the artist and tour are known server-side; feed them down rather than leaving the client to guess. The picker must show the current artist on a cold load with no prior interaction.
3. **Then audit every gate.** Grep for consumers of the context that gate a fetch, an enabled state, or a render on it. Each one is a latent version of this bug. List them in the report even if you only fix the live ones.
4. **Prefer server props over ambient client context** for anything a server component already knows. The identity band is the proof this works — it is the one lockup on the page that renders correctly.

## Test (must be in the report)
Cold load `/operations/6889d072-20c8-467c-9fbc-4d2469f6cac0/personnel` in a fresh session with no prior artist interaction. Assert: (a) personnel rows render, (b) at least one data request fires — paste the URL, (c) the picker shows "Charlotte Sands", not the placeholder. Smokes CTX-01..03. PAY-09 (Personnel read-only rate mirror → click routes to Payroll) can finally be graded once this lands — verify it in the same pass.

---

## Cowork verification of `f3b7d3f` — what PASSED (do not re-do this work)

**G2-2b payroll days matrix — PASS on every specced metric**, measured on the deployed CSS grid at 3440×1323:
- Day columns: 31 columns, every one `99.5px`; `[...new Set()]` → `[100]`. Spec A (uniform) ✅
- Left block `320px` ✅ · header row `64px` ✅ · person rows `[52, 52, 52, 52, 52]` ✅ (spec D)
- Person name `15px/500` ✅ · meta `12px` ✅ · row total `18px/700` ✅ · cell letter `13px/600` ✅ (spec C)

*Correction owed to CC: Cowork's earlier failing numbers (`128/144/112…`, rows `37/32/32`) came from `document.querySelector('[role=grid]')`, which resolves to the **collapsed RATES `<table>`** (2105×250, `table-layout: fixed`, sitting at the same `top` as the matrix), not the days matrix. CC was right; the measurement was aimed at the wrong node. The rates table is inert — `focus()` on its only focusable child fell through to BODY — so it is not a tab-trap.*

**G2-2b patch matrix — columns PASS:** 33 columns, left block `240px`, all 32 socket columns exactly `40px`, single unique value. Spec F target met.

**G2-4 identity band — PASS.** Artist `13px/700`, tour `13px/400`, identical on channel-list, stage-plot, riders, personnel, payroll and budget. The RSC payload shows the same component invoked with the same prop shape (`tourId`/`artistName`/`avatarUrl`/`tourName`/`statusLabel`/`statusKey`) on every one. HDR-01 ✅.

## Two smaller things found on the same walk (fix opportunistically, not P0)
- **Patch matrix does not go full-bleed.** It measures `1534px` wide, centred at `left: 947 / right: 2481` in a `3440px` viewport — ~950px of dead space on each side. Payroll's matrix correctly fills the width. Spec B's "the matrix is the work surface" was applied to payroll but not to patch; on Adam's 3440px monitor this reads as the original "why doesn't it scale with the page" complaint. Same treatment as payroll.
- **Channel list page title is still hand-rolled.** It renders "Channel list" in sentence-case regular weight while payroll renders "SIMPLE PLAN SUPPORT | FALL'26 — PAYROLL" in the condensed caps `.lp-page-title` system. This is one of the four known F2 stragglers (Personnel / Channel list / Advance overview / Riders) — adopt `<PageTitle>`.
