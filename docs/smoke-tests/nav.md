# Nav & entry smoke tests

> Prefix: `NAV`. Covers the Nav & entry fixpack (Stage 4): post-login
> landing, tour-open product resolution, orphan/stub routes, admin gates.
> Format defined in `docs/smoke-tests/README.md`.

## Post-login landing (item 3)

#### NAV-01 — Login lands directly on /artists (no /dashboard bounce)

**Do**: Sign in from `/login` with no `?next=`.

**Expect**: One redirect to `/artists` (the workspace landing) — no
intermediate `/dashboard` (retired) hop. A single-artist workspace then
auto-skips to `/artists/{id}` (Salvage #5). With `?next=/budget/X`, lands
on `/budget/X` instead.

**Last verified**:

#### NAV-02 — Authenticated visit to /login redirects to /artists

**Do**: While signed in, navigate to `/login` directly.

**Expect**: Middleware redirects to `/artists`, not `/dashboard`.

**Last verified**:

## Tour-open resolves to last-used product (item 1)

#### NAV-03 — Tour card / Resume open the last-used product

**Do**: Open a tour's Budget, then its Operations (so Operations is the
last product used). Return to the artist Home; click the tour card. Then
from the workspace landing, click "Resume …" for that tour.

**Expect**: Both land on `/operations/{tourId}` (the last product used),
not the old hardwired `/budget/{tourId}`. The Resume button label reads
"Resume Operations". A never-opened tour falls back to Operations.

**Last verified**:

#### NAV-04 — Card still selects → banner (behavior unchanged)

**Do**: On the artist Home, click a tour card.

**Expect**: The tour selects and the ActiveTourBanner (Operations / Budget /
Advance + "Change tour") behaviour is unchanged — only the resolved open
href changed (per UX_WALK §Correction).

**Last verified**:

## Orphans & stubs (item 5)

#### NAV-05 — /tours redirects to /artists

**Do**: Navigate to `/tours` (the bare legacy list).

**Expect**: 301 → `/artists`. (Every `/tours/:id*` URL already redirected;
this closed the last gap. 301s cache hard — test in incognito.)

**Last verified**:

#### NAV-06 — /admin/ai-usage single chrome (no double shell)

**Do**: As a site admin, open `/admin/ai-usage`.

**Expect**: One set of page chrome (from `admin/layout.tsx`'s
listAppPageShell) — the page no longer wraps itself in a second
`<ProductShell>`. KPI tiles + dashboard render normally.

**Last verified**:

#### NAV-07 — /grid-demo is site-admin-only

**Do**: Visit `/grid-demo` as (a) a non-admin user, (b) a site admin.

**Expect**: (a) 404 (notFound gate). (b) The Grid smoke harness renders.

**Last verified**:

## Stage B — grouped single-row nav

> The two-bar nav (4-product filled-pill row + flat 8-tab Operations bar) is
> replaced by one grouped row. NAV-08 is the chrome-hydration test in
> `visual.md`; Stage-B nav IDs start at NAV-09.

#### NAV-09 — Grouped top row on the tour tier

**Do**: Open any tour surface (`/operations/{t}/routing`, `/budget/{t}`,
`/advance/{t}/…`).

**Expect**: ONE nav row reading `Routing | $ Budget · ⧉ Advance | Crew ·
Production · Files` — hairline dividers between the three clusters, the `$`
(DollarSign) and `⧉` (ClipboardList) icons ONLY on Budget and Advance, and the
active group marked by an **orange underline** (never a filled orange pill). No
second global tab bar. Settings gear sits at the far right.

**Last verified**:

#### NAV-10 — Active group derived from the pathname

**Do**: Walk `/operations/{t}/payroll`, then `/operations/{t}/channel-list`,
then `/budget/{t}`, then `/advance/{t}/{routingId}`.

**Expect**: The underlined group tracks the URL — Crew on payroll, Production on
channel-list, Budget on budget, Advance on advance. No page passes an `active`
prop; the highlight follows `activeNavGroup(pathname)`.

**Last verified**:

#### NAV-11 — Group segmented control (Crew / Production only)

**Do**: Visit a Crew page (Personnel / Payroll / Rooming), a Production page
(Channel list / Stage plot / Riders), then Routing and Files.

**Expect**: Crew shows a segmented control `[ Personnel · Payroll · Rooming ]`;
Production shows `[ Channel list · Stage plot · Riders ]` (active segment tinted
orange). Routing (the landing, which absorbs the old Summary) and Files show NO
second bar — the top row is their only nav. Members the caller can't read are
dropped; a group with <2 readable members shows no control.

**Last verified**:

#### NAV-12 — Artist tier has no product nav

**Do**: Open `/artists/{id}` (artist home) and its library surfaces.

**Expect**: No product nav row at all — chrome is the workspace/artist switcher
pills + account menu, and the page's own Tours / Production / Business tabs are
the only navigation. (The grouped row is tour-scoped: `selectedTourId` is
URL-derived and null on artist/workspace URLs, so `TopProductNav` renders
nothing.)

**Last verified**:

#### NAV-13 — Advance-day breadcrumb carries the show

**Do**: Open a per-show Advance surface (`/advance/{t}/{routingId}`).

**Expect**: The Build / Advance / Share switcher shows a breadcrumb tail with
the show (venue/city) + date before the tabs, and the artist + tour read from
the persistent header pills — together the full `Artist / Tour / Date · show`
chain. Advance is the underlined group on the top row.

**Last verified**:

## Known good (no code change — verified NO-OPs)

- **/gear** — NOT deleted. `/gear` is the canonical Gear Library (`gear`
  entities); the Equipment workspace tab is the Rental House
  (rental_inventory / rental_jobs) — a different data model, so Equipment
  does not cover it. Per "verify-then-delete", the delete is blocked. It
  remains an orphan pending Adam's nav decision.
- **/settings/ai-limits** — already linked from `/settings` via the
  SettingsSubNav "AI limits" tab (`SettingsSubNav.tsx` SETTINGS_LINKS),
  mounted on the settings page. No new link needed.
- **/admin/{shell,data-table,spreadsheet}-playground + /admin/design-tokens**
  — already site-admin-gated (each calls `getUserAndAdminStatus` + inherits
  `/admin/layout.tsx`). Left as-is.
- **/stage-plot-{editor,icon-preview,canvas-preview}** — already
  `return null` in production. `/stage-plot-icons` gained a server layout
  that `notFound()`s in production to match (item 5).

## Known broken

(None yet.)

## Identity band — one lockup everywhere (G2-4) — 2026-07-19

#### HDR-01 — the artist/tour lockup is identical on every grouped surface
**Do**: Visit these tour surfaces and compare the identity band directly under the
product header: Operations Personnel · Payroll · Rooming · Channel list · Stage
plot · Riders; Budget (any tab); Advance (a show day).
**Expect**: the SAME `<IdentityLockup>` on all of them — 26px avatar · artist ·
condensed tour · status pill, same size + position, fed by one loader
(`loadTourIdentity`). No per-page variants: the advance `TourHeader` (bigger
artist-logo + stats block) is retired, ops uses `TourIdentityBand` → IdentityLockup,
budget mounts the same component. Routing + Files keep their own chrome (not grouped).
**Also**: advance no longer runs the async Spotify logo resolver on every page
(loadTourIdentity is DB-only), removing that hang risk. **Needs-live**.

## ArtistTourContext hydration + personnel (P0) — 2026-07-19

#### CTX-01 — picker shows the artist on a cold tour load
**Do**: In a fresh session (no prior artist interaction), cold-load
`/operations/[tourId]/personnel`.
**Expect**: the top-bar picker shows the tour's artist (e.g. "Charlotte Sands"),
NOT "Pick an artist…". Root cause was `extractArtistIdFromPath` only matching
`/artists/[uuid]`; the tour layouts now feed the server-known artistId via
`<HydrateTourArtist>` → `provideTourArtist`. **Needs-live**.

#### CTX-02 — same on budget + advance
**Do**: Cold-load `/budget/[tourId]` and `/advance/[tourId]/[routingId]`.
**Expect**: picker shows the artist on both. **Needs-live**.

#### CTX-03 — artist-gated controls work on cold load
**Do**: On a cold tour page, check the "New tour" affordance / scope guard /
dashboard artist gate.
**Expect**: they behave as if an artist is selected (it is, now) — no "switch
artist to enable" dead state. **Needs-live**.

#### PAY-09 — Personnel read-only rate mirror + click→Payroll (unblocked)
**Do**: Cold-load `/operations/[tourId]/personnel`.
**Expect**: (a) personnel rows render; (b) at least one data request fires —
`GET /api/tours/[tourId]/personnel`; (c) the read-only Rate cells route to Payroll
(focus the person) on click. The `useSearchParams()` (no-Suspense) anomaly was
removed — `conflictsOnly` is read on the server and passed as a prop. **CANDIDATE
fix for the hang — needs a Cowork re-walk to confirm the loader now fires.**
