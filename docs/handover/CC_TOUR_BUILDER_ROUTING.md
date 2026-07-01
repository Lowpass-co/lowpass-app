# CC — Tour creation (fix + one modal) · Routing view revamp · Branded map pins. Build. Off `main`.

Three linked workstreams so Adam can actually create and route a tour with chrome that matches the app.
**Prerequisite:** the master-sprint stack (`feat/sprint-cleanup` → main) + migration 225 must be on `main`
first. Branch Part 1 off the updated `main`; stack Parts 2 and 3 on the prior branch. Work **1→2→3 in order**
(Part 3 reuses Part 2's restyled routing grid).

> ## ⚙️ PER-PART PROTOCOL (do all five, every part)
> 1. **CHECK THE CODEBASE FIRST** — open the real files cited below, confirm they still say what's claimed,
>    cite file:line. Don't assume shapes.
> 2. **BUILD.**
> 3. **THOROUGH SMOKE — prove it, don't just build-green.** A functional reproduction (node harness on the
>    real path, or a live/DOM check), not only `tsc`/`eslint`/`next build --webpack`. State the evidence.
>    Write smoke IDs into `docs/smoke-tests/`.
> 4. **PUSH + REPORT** — commit, push, confirm `git log origin/<branch>` has the hash; report hash + smoke
>    evidence.
> 5. **CONTINUE.** Stop + flag only on a real blocker / invariant risk.
>
> ## INVARIANTS
> - Tokens only (`var(--lp-*)`, hex+alpha or `color-mix`, never JS-concat a CSS var). No hardcoded hex.
> - Read-only where read-only; workspace-RLS on every query (`get_my_workspace_id()`); no cross-workspace leak.
> - Reuse existing primitives (`<Modal>`, `<SlideOver>`, the routing grid) — don't roll new chrome.
> - Don't regress the export routing map (`routing-pdf.ts`), the sprint work, or versioning/income/receipts.

---

## PART 1 — Branded, exact map pins. Branch `feat/tour-map-pins` off `main`.
**The map (`src/components/routing/RoutingMap.tsx:242–250`) is Leaflet + a custom `divIcon`. Two confirmed
bugs:**
- The pin is the **stock Leaflet blue teardrop loaded from `https://unpkg.com/...marker-icon.png`** — external
  CDN, unbranded.
- **Double-anchor drift:** `iconAnchor:[12,41]` on an `iconSize:[60,50]` box **plus** an inner
  `style="transform: translate(-50%,-100%)"`, with a **variable-width date label above the pin**. The label
  width changes the `-50%` horizontal shift per pin, so pins sit off-true and appear to crawl on zoom.

Build:
1. **Branded pin, inline (no external fetch).** Replace the unpkg `<img>` with an **inline SVG teardrop** in
   Lowpass orange (`var(--lp-orange)` / `#FF4500`), styled to match the export map's orange treatment
   (`routing-pdf.ts` `renderRouteMap` uses orange fills — match it so in-app and PDF read as one brand).
   Day-type can tint the pin (reuse `getDayTypeColor`) but keep it on-brand.
2. **Deterministic anchor — kill the drift.** Make the pin a **fixed known-size SVG** and set `iconAnchor`
   to its exact tip (bottom-centre), with **NO** `transform: translate()` on the anchored element. Move the
   **date label out of the anchored pin** — into a permanent Leaflet `Tooltip` (or a separate, non-anchoring
   element) so its variable width can never shift the pin. Result: `iconSize` = the SVG's real px size,
   `iconAnchor` = [width/2, height] (the tip). Leaflet reprojects a correct anchor perfectly across zoom —
   the pin will lock to its coordinate.
3. **Apply the same branded pin to `src/components/budget/BudgetRoutingMap.tsx`** (same library, same stock
   marker) so both maps match. Check `createTransportDivIcon` (the leg mid-icons) are on-brand too.
Smoke `MAP-PIN-01..03`: pin renders branded (no unpkg URL in output); **at 3 different zoom levels the pin
tip stays on the same lat/lng** (assert the anchor math / no transform); label no longer affects position.
Note: pin *data* accuracy (Google Places lat/lng) is separate from rendering — this part fixes rendering.

## PART 2 — Routing view revamp (restyle + functionally sound). Branch `feat/routing-revamp` off Part 1.
**Adam's call: RESTYLE to match the app — do NOT migrate to `<SpreadsheetGrid>`.** Routing is a structured
list (date · day-type · city · venue · transport), not a numeric spreadsheet; keep the bespoke engine and its
venue-autocomplete + date-seeding, but bring the chrome up to the app's canonical language.
Check: `RoutingEditor.tsx:126–532` (holds `ViewMode = 'grid'|'calendar'|'map'`, the toggle at 327–346, save
at 263–302), `RoutingGrid.tsx` (bespoke table), `RoutingCalendar.tsx`.
1. **Restyle `RoutingGrid`** to match the canonical grids/`DataTable` visually — header chrome, row height,
   dividers, hover, cell padding, the day-type + transport pills — all via tokens. It should read as the same
   family as the budget/rooming grids without being the SpreadsheetGrid engine.
2. **Restyle `RoutingCalendar` + the view-toggle button group** to match (consistent chrome across all three
   views).
3. **"Functionally sound" — find + fix what's janky.** Exercise: add row, delete row (+ confirm), edit
   venue via the picker (lat/lng capture into the row), change transport mode, the save round-trip
   (`POST /api/tours/[id]/routing`), reload → persisted. Fix whatever breaks; report what you found.
Smoke `ROUTE-UI-01..`: all three views share chrome; add/edit/delete/save round-trips and persists; venue
pick writes lat/lng; DEFAULT data renders unchanged.

## PART 3 — One modal tour creator; retire the wizard; MAKE CREATE WORK. Branch `feat/tour-create-modal` off Part 2.
**Adam's decision: ONE modal builder is the single creator; RETIRE the full-page wizard.** And critically —
**Adam currently cannot create a tour at all**, so this part must PROVE an end-to-end tour insert works, not
just restyle.

Context (verified):
- **The 404:** `next.config.ts:180` `{ source:'/tours/:id', destination:'/operations/:id', permanent:true }`
  has an **unconstrained `:id`**, so `/tours/create` 301s to `/operations/create` (no page) → 404. It's a
  **cached 301** — even after the fix it keeps 404ing in a warm browser; test in incognito.
- **Wizard:** `src/app/(app)/tours/create/page.tsx` → `<TourWizard>` (also the `?edit=<id>` surface).
- **Quick builder (becomes the modal):** `src/components/shell-v2/TourCreateSlideOver.tsx` (2-step: Tour info
  → embedded routing; POST `/api/tours` then `/api/tours/[id]/routing`), opened from
  `ArtistTourSwitcherClientWrapper.tsx:58,234`.
- **Modal primitive to use:** `src/components/ui/Modal.tsx` (`size='lg'`, scrim, focus-trap, Esc/backdrop) —
  the same family as `ExportTemplateEditor.tsx`. Edit surface that already exists: `EditTourSlideOver`.

Build:
1. **Rebuild `TourCreateSlideOver` as a `<Modal size='lg'>`** (export-editor visual style) — keep the 2-step
   flow (Tour info → Routing) as modal steps; **embed the Part-2 restyled routing grid** on step 2. Same
   fields/validation/submit as today. Remove the "full tour wizard" fallback link.
2. **Repoint EVERY entry point to open the modal** (grep `tours/create` first): the tours-list "New Tour"
   button + empty-state (`src/app/(app)/tours/page.tsx`), `AppTopBar` quick-create, the switcher (already
   wired). Nothing should navigate to `/tours/create`.
3. **Rehome edit.** `DashboardTourCard` currently does `router.push('/tours/create?edit='+id)` (a dead path).
   Repoint tour-edit to **`EditTourSlideOver`** (the canonical edit surface); confirm it covers the fields the
   wizard's edit mode did. If a gap exists, flag it — don't silently drop a field.
4. **Delete the wizard** — `src/app/(app)/tours/create/page.tsx` + `TourWizard` component — **only after**
   grepping zero remaining importers/links.
5. **Constrain the redirect (defensive):** change `next.config.ts:180` `:id` to a UUID pattern
   (e.g. `/tours/:id([0-9a-fA-F-]{36})`) so no static segment mis-301s. Note the 301-cache gotcha in the report.
6. **PROVE CREATE WORKS (the whole point).** Reproduce a tour insert end-to-end — `POST /api/tours` with a
   real workspace/artist → row created → then routing rows → the tour opens. Adam says he can't create one, so
   there may be a second bug beyond the 404 (submit, RLS/workspace scoping, artist requirement). **Find and fix
   whatever blocks a successful create.** Don't report done until a tour is provably created.
Smoke `TOUR-CREATE-01..`: modal opens from tours-list + topbar + switcher; a NEW tour is created
end-to-end (info + routing) and opens; edit opens `EditTourSlideOver`; `/tours/create` no longer linked; the
retired wizard is gone with zero dangling refs.

---

## Final
- Each part its own branch, stacked; commit + PUSH; report hash + smoke evidence; continue.
- No migration expected (all UI + one redirect constraint). If create turns out to need a schema/RLS change,
  STOP and flag — don't invent columns.
- End report: table (part · branch · hash · what landed · smoke evidence) + the create-path root cause you
  found (was it only the 404, or a second bug?).
