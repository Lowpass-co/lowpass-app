# Nav Redesign — Artist → Tour → Work Hubs + Persistent Breadcrumb

> The current nav is fragmented: TopBar destinations are workspace-scoped, the LeftRail mutates per-archetype (filters / dates / sections), and there's no consistent way to step Artist → Tour → Page or back. Adam's vision: log in, pick an artist, pick a tour, land on a tour hub with VERY obvious places for work (Advance + Budget). Persistent breadcrumb everywhere so you always know where you are. This prompt makes that real.
>
> **Mental model lock — internalise before writing code:**
>
> - **Artist Hub** = where artist-level info LIVES (riders, tech specs, financial admin, stage plot). Tours reference this info.
> - **Tour Hub** = working hub. The two pieces of work-while-touring (Advance, Budget) are big and obvious. The build-once stuff (Routing, Channel List, Personnel, Rooming) is a status strip — important but not screaming for attention once green.
> - **Tour-internal pages** = Advance / Budget / Routing / Channel List / Rooming / Payroll. Each gets a persistent breadcrumb strip (`← Artist › Tour › Page`) plus a "Back to tour" button. The contextual LeftRail (date strip in Advance, etc.) keeps doing its thing — but the breadcrumb is the spine that lets you escape upward.

---

## 0. Required reading

1. `CLAUDE.md`
2. `HANDOVER_FOR_BEN_2026_04_29.md` — current state of the codebase (note: 060 was applied via direct SQL, not as a migration file in repo; rider_folders SELECT/DELETE policies were also patched directly)
3. `src/app/(app)/artists/page.tsx` and `src/app/(app)/artists/[id]/page.tsx` — existing artist surfaces
4. `src/app/(app)/tours/[id]/page.tsx` — current tour overview, uses TimelineDashboard via UX16
5. `src/components/dashboard/DashboardArtistGate.tsx` — existing artist-picker pattern (model for /artists redesign)
6. `src/components/shell/TopBar.tsx` — current top nav
7. `src/components/shell/LeftRail.tsx` — variant-driven contextual rail
8. `src/components/shell/app-page-shells.tsx` — page-shell helpers per archetype
9. `src/contexts/ArtistTourContext.tsx` — `selectedArtistId` + `selectedTourId` state container
10. `src/components/advance/AdvanceShowContextBar.tsx` — sticky breadcrumb pattern from UX22 phase 2 (the model for the new tour-wide breadcrumb)

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens. Brand orange transparent variants must be hex+alpha (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concat.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/121 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only. Turbopack hangs on Drive.
6. Adam's product locks (do not relitigate):
   - Single-artist workspace → auto-skip the picker, redirect post-auth straight to that artist's hub.
   - "+ Add new artist" available at every level (picker, artist hub, tour hub).
   - Tour Hub's two big CTAs are **Advance** + **Budget** only. Riders shrinks to a "linked: N" pill in the Setup strip because riders are referenced from the Artist Library.
   - Setup chip strip categories: **Routing / Channel list / Personnel / Rooming / Riders linked**.
   - Artist Library categories: **Riders / Tech specs / Financial admin / Stage plot** (note: was "W9 / tax forms" in earlier drafts; "Financial admin" is the final label).
   - Persistent breadcrumb on every tour-internal page: `← Artist › Tour › Page`. Each segment clickable. "Back to tour" button on the right.
   - Top-right TopBar tour switcher stays as a quick-switch affordance (does NOT get removed when you're inside a tour hub — but the Tour Hub also gets its own "Switch tour ▾" pill in the top-right of the page body).
7. Seven commits, in order: A → B → C → D → E → F → V.

---

## A. Post-auth redirect logic + Artist Picker (~45 min)

### A.1 Post-auth redirect

In whatever middleware / root layout / login-callback handler currently routes signed-in users (search: `redirect(` calls in `src/app/(auth)/**`, `src/middleware.ts`, `src/app/(app)/layout.tsx`, and the auth callback route), add this rule:

After successful auth, the landing page is determined by artist count in the user's workspace:

- **0 artists** → `/artists?onboard=1` (existing onboarding flow OR a stub "Create your first artist" CTA inside the picker page)
- **1 artist** → `/artists/[id]` (skip the picker)
- **2+ artists** → `/artists`

Implement this as a small helper `resolvePostAuthLanding(supabase, userId): Promise<string>` in `src/lib/auth/landing.ts` that returns the path. Wire it into wherever the post-auth redirect currently fires.

If the user has a `?next=...` query param (e.g. they were trying to reach a specific page before being bounced to login), respect that and skip the artist landing logic.

### A.2 Artist Picker page polish

The existing `src/app/(app)/artists/page.tsx` becomes the canonical picker. Visual target: the mockup's Step 1, but as a STANDALONE picker (not inside the artist hub).

- Page archetype: `list` (set via `listAppPageShell` or whatever the helper is named). LeftRail = empty / hidden when there are no filters/views (per the existing UX13 fix-sprint Step C behaviour).
- Header: "Artists" title + subtitle "Pick an artist to start working" + "+ Add new artist" button on the right.
- Body: grid of artist cards (`grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))`, gap = `var(--lp-space-4)`).
  - Each card: artist logo (or initials chip in `var(--lp-orange)` if no logo) + artist name + sub-line "N tours · M active shows". Click → `/artists/[id]`.
- "+ Add new artist" button opens the existing `NewArtistSlideOver` (don't reinvent).

### A.3 Acceptance

- [ ] Logging in fresh with multiple artists lands on `/artists`
- [ ] Logging in fresh with exactly one artist redirects directly to `/artists/[that-id]`
- [ ] Logging in fresh with zero artists shows an onboarding-style empty state on `/artists` (or whatever flow currently handles first-artist creation)
- [ ] `?next=...` is respected and overrides the artist landing
- [ ] Artist cards link cleanly to `/artists/[id]`
- [ ] No lint/type regressions

### A.4 Commit

```
feat(nav): post-auth lands on /artists with single-artist auto-skip

After successful auth, route based on artist count in the user's
workspace: 0 → onboard, 1 → that artist's hub, 2+ → picker. Respects
?next= override for deep links.

Artist Picker page polished to a card grid with "+ Add new artist"
in the header. Existing NewArtistSlideOver reused, no new modal.

Made-with: Claude Code (nav redesign)
```

---

## B. Artist Hub redesign (~2 hrs)

The `/artists/[id]` page becomes the home for artist-level info. Visual target: mockup Step 1 layout (this is the SAME mockup; the picker in A is a sibling page).

### B.1 Layout

`src/app/(app)/artists/[id]/page.tsx` — Server Component, async, fetches:
- The artist (existing query)
- Tours for this artist (existing or via `getEntityDescriptor('tour').search({ artistId })`)
- Library counts for the four categories (see B.3)

Page archetype: `dashboard` (or `list` if dashboard doesn't fit the two-column layout — confirm by reading `app-page-shells.tsx`).

Top strip (full-width, above the two-column body):
- Left: `← All artists` link → `/artists`
- Right: `+ Add new artist` button (opens `NewArtistSlideOver`)

Hero (full-width):
- Artist logo (or initials chip in `var(--lp-orange)`) — 40px circle
- Artist name as an H1 (`var(--lp-text-2xl)` weight 600)
- Sub-line: "N tours · M active shows · K upcoming" using brand-orange accent on key numbers

Two-column body (`grid-template-columns: 1.4fr 1fr`, gap `var(--lp-space-4)`, stacks on narrow viewports):

**Left column — Tours**

- Section heading "TOURS" (`var(--lp-text-xs)` uppercase, tracking-wider, color `var(--lp-text-tertiary)`)
- List of tour cards. Use the real `<DataTable>` primitive from `@/components/data-table/DataTable` ONLY if the column shape needs sorting/filtering — otherwise render as a stacked card list (mockup shows cards). Each card:
  - Tour name (weight 500)
  - Status pill — Active (green tint), Completed (gray tint), Planning (amber tint) — token-driven via `--color-lp-status-*`
  - Sub-line: date range + "N shows"
  - Click → `/tours/[id]`
- "+ New tour" button at the bottom — opens whatever the current new-tour flow is (likely `/tours/new` or a slide-over)

**Right column — Artist Library**

- Section heading "ARTIST LIBRARY"
- Four cards stacked vertically, each:
  - Title (weight 500): Riders / Tech specs / Financial admin / Stage plot
  - Sub-line: "N templates" / "M documents" / "K files" / "1 file"
  - Click → relevant page (see B.3)

### B.2 New component

`src/components/artists/ArtistLibraryCard.tsx` — small reusable card. Props: `title`, `count`, `countLabel` (e.g. "templates"), `href`, optional `icon`. Uses `var(--lp-…)` tokens. Hover state: subtle bg shift.

### B.3 Library wiring

- **Riders** → links to existing rider system. The current rider page route is `/rider-packs` (likely with an artist filter) — link as `/rider-packs?artist=[id]` or whatever the existing query shape is. Read `src/app/(app)/rider-packs/page.tsx` to confirm.
- **Tech specs / Financial admin / Stage plot** — these don't have backing tables yet. Stub each with an `<ArtistLibraryCard>` that links to a placeholder route `/artists/[id]/library/[category]` (where category is `tech-specs`, `financial-admin`, `stage-plot`). The placeholder page renders an empty state: heading + "No [category] yet — add one" CTA + `+ Add` button. Add button can be a stub `alert("Coming soon")` for this phase — the data model for these is a follow-up sprint, not blocking the nav work.

The library counts on the Artist Hub itself: Riders count comes from the real rider system (count rider_packs where artist_id = X). The other three return `0` for now (stub the count fetcher; mark with a `// TODO(artist-library-data-model)` comment).

### B.4 Acceptance

- [ ] `/artists/[id]` renders with the two-column layout
- [ ] Tours list shows all of this artist's tours with correct status pills
- [ ] Click a tour card → navigates to `/tours/[id]` and `selectedArtistId` is set in `ArtistTourContext`
- [ ] Artist Library shows four cards: Riders (with real count), Tech specs / Financial admin / Stage plot (count = 0 with TODO)
- [ ] "+ New artist" button in the page header opens `NewArtistSlideOver`
- [ ] "+ New tour" button at bottom of tours column opens the new-tour flow
- [ ] Stub library category pages exist at `/artists/[id]/library/[category]` and render empty states
- [ ] No lint/type regressions

### B.5 Commit

```
feat(artists): Artist Hub redesigned — tours list + Artist Library

Two-column layout. Left: tours list as cards with status pills
(token-driven via --color-lp-status-*). Right: Artist Library
section with four card categories — Riders, Tech specs, Financial
admin, Stage plot.

Riders card links to existing rider system with real count.
Tech specs / Financial admin / Stage plot are stubs that link
to placeholder /artists/[id]/library/[category] pages with
empty-state CTAs. Data model for these three is a follow-up.

"+ Add new artist" reuses NewArtistSlideOver. "+ New tour" reuses
existing new-tour flow.

Made-with: Claude Code (nav redesign)
```

---

## C. Tour Hub redesign (~3 hrs)

`/tours/[id]` becomes the working hub. Visual target: mockup Step 2.

### C.1 Layout

`src/app/(app)/tours/[id]/page.tsx` — Server Component. Fetches: tour + artist + show count + advance status counts + budget summary + setup status checks.

Top strip (full-width, above hero):
- Left: `← [Artist name]` link → `/artists/[artist-id]`
- Right: `Switch tour ▾` dropdown (lists this artist's tours, click → `/tours/[other-id]`)

Hero:
- Tour name (H1, weight 500, `var(--lp-text-2xl)`)
- Status pill (Active / Completed / Planning) using `--color-lp-status-*`
- Sub-line: "Mar 20 – Apr 30, 2026 · [Artist name]"

**Setup chip strip** (`SetupStatusStrip` new component):
- Heading "SETUP · BUILD-ONCE" (uppercase, tracking-wider, tertiary)
- Five chips in a row, wraps on narrow:
  - Routing — green ✓ if `routing.length > 0` for this tour, else gray —
  - Channel list — green ✓ if a channel-list config exists for this tour, else gray —
  - Personnel — green ✓ if any personnel assigned to this tour, else gray —
  - Rooming — green ✓ if any rooming records exist, else gray —
  - Riders linked — orange `↗ N` (the count of artist riders linked to this tour, or 0)
- Each chip is a clickable link to its respective page (`/tours/[id]/routing`, etc.)

**Two big CTA cards** (`grid-template-columns: 1fr 1fr`, gap `var(--lp-space-3)`):

Each card:
- Border: `2px solid var(--lp-orange)` (this is deliberate — UX01 reserves 2px borders for accent/featured items)
- Background: `color-mix(in srgb, var(--lp-orange) 4%, transparent)`
- Border-radius: `var(--lp-radius-lg)`
- Padding: `var(--lp-space-4)`

**Advance card:**
- Label "Advance" (var(--lp-text-sm), color tertiary)
- Big metric: "12 / 28" (var(--lp-text-2xl), weight 500)
- Sub-line: "shows complete · 43%"
- Progress bar: 6px tall, full-width, fill = brand orange
- CTA text: "Open advance →" (var(--lp-orange), weight 500)
- Click anywhere on the card → `/tours/[id]/advance`

**Budget card:**
- Label "Budget"
- Big metric: "£42K / £85K" (the slash + total muted)
- Sub-line: "spent · 49% of estimate"
- Progress bar: 6px tall, fill = `var(--color-lp-status-complete)` (green) when on-budget, amber when over 80%, red when over 100%
- CTA text: "Open budget →"
- Click → `/tours/[id]/budget`

**Tour timeline** (existing TimelineDashboard from UX16):
- Render as a secondary section below the two CTAs
- Heading: "TIMELINE"
- Same component, smaller visual weight (e.g. wrapped in a card with `var(--lp-bg-secondary)` background)

**Secondary cards** (`grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`, gap `var(--lp-space-2)`):

Four small cards, each:
- Title (weight 500)
- Sub-line (count or status)
- Click → respective tour-internal page

Items: Personnel · N assigned · /tours/[id]/personnel (or wherever); Routing · N dates · /tours/[id]/routing; Channel list · N inputs · /tours/[id]/channel-list; Rooming · N rooms or "Not set" · /tours/[id]/rooming.

### C.2 New components

- `src/components/tours/SetupStatusStrip.tsx` — chip row, props `tourId` + counts
- `src/components/tours/TourPrimaryCTACard.tsx` — the big Advance/Budget card shape, generic with `title`, `primaryMetric`, `subLabel`, `progressPercent`, `progressColor`, `href` props
- `src/components/tours/TourSecondaryCard.tsx` — small card for the bottom row

### C.3 Server data fetching

`src/server/tours/getTourHubData.ts` — single async function that returns `{ tour, artist, advance, budget, setup, secondary }` shaped for the page. Use Promise.all for parallel fetches. Counts can come from Supabase `count` queries (cheap).

For `setup`, do a quick existence check per category — `select('id').limit(1)` patterns. Don't over-fetch.

### C.4 "Switch tour ▾" dropdown

Top-right of the page body (NOT the TopBar). Lists this artist's tours (excluding the current one), each row is a link. Use a small dropdown component or a `<details>` element — don't reinvent. A `Switch tour ▾` button reusing the same pattern as the existing TopBar tour selector but scoped to this artist.

### C.5 Acceptance

- [ ] `/tours/[id]` renders with the new layout — top strip, hero, Setup strip, two big CTAs, timeline, secondary cards
- [ ] Setup chips correctly reflect actual data state (each chip green ✓ or gray —)
- [ ] Advance and Budget CTAs show real counts and percentages from the database
- [ ] Click CTAs → navigate to `/tours/[id]/advance` and `/tours/[id]/budget`
- [ ] Setup chips are clickable and navigate correctly
- [ ] Switch tour dropdown lists this artist's other tours and switching works
- [ ] Existing tour features (TimelineDashboard, etc.) still render
- [ ] No lint/type regressions

### C.6 Commit

```
feat(tours): Tour Hub redesigned — Advance + Budget primary, Setup strip, secondary cards

Visual structure: top strip (← Artist link + Switch tour pill),
hero with status pill, Setup chip strip (Routing / Channel list /
Personnel / Rooming / Riders linked) using --color-lp-status-*
tokens, two big CTA cards (Advance + Budget) with 2px brand-orange
borders and progress bars, TimelineDashboard as secondary, four
small cards for the build-once stuff.

Server data via new getTourHubData() with parallel fetches.
SetupStatusStrip / TourPrimaryCTACard / TourSecondaryCard
introduced as reusable primitives.

Made-with: Claude Code (nav redesign)
```

---

## D. Persistent breadcrumb strip (~2 hrs)

The biggest UX win. The `AdvanceShowContextBar` from UX22 phase 2 is the model — copy the sticky pattern but make it tour-wide.

### D.1 New component

`src/components/tours/TourBreadcrumb.tsx` — Client Component, sticky, used on every tour-internal page.

Shape:
```
[← Artist name › Tour name › Page name]                    [Back to tour]
```

- Sticky: `position: sticky; top: 0; z-index: var(--lp-z-sticky)`
- Background: `color-mix(in srgb, var(--lp-bg) 88%, transparent)` with `backdrop-filter: blur(8px)`
- Bottom border: 1px `var(--lp-border)`
- `print:hidden`

Each segment clickable:
- "← Artist name" → `/artists/[artistId]`
- "Tour name" → `/tours/[tourId]`
- "Page name" — current page, not clickable, weight 500, color `var(--lp-text)`
- Right side: `[Back to tour]` button → `/tours/[tourId]`

Props: `artistId`, `artistName`, `tourId`, `tourName`, `pageName`. Server-resolved by the parent route, passed in as props.

### D.2 Mount on every tour-internal page

Files to update (each gets `<TourBreadcrumb>` mounted as the first child of the page's main content):

- `src/app/(app)/tours/[id]/advance/page.tsx` (overview)
- `src/app/(app)/tours/[id]/advance/[routingId]/page.tsx` (per-show — note: this already has AdvanceShowContextBar from UX22 phase 2; ADD TourBreadcrumb ABOVE it, or replace context bar entirely if redundant — Adam's preference is BOTH visible since the show-level context is its own thing)
- `src/app/(app)/tours/[id]/budget/page.tsx`
- `src/app/(app)/tours/[id]/routing/page.tsx`
- `src/app/(app)/tours/[id]/channel-list/page.tsx`
- `src/app/(app)/tours/[id]/rooming/page.tsx`
- `src/app/(app)/tours/[id]/payroll/page.tsx`
- `src/app/(app)/tours/[id]/rider-packs/page.tsx`
- `src/app/(app)/tours/[id]/files/page.tsx`
- `src/app/(app)/tours/[id]/hire/page.tsx`
- Anything else under `src/app/(app)/tours/[id]/**` — grep and ensure all pages get it

For each page, the parent route layout (or the page itself) needs to fetch artistId + artistName + tourName once. Consider extracting that into a shared `src/server/tours/getTourBreadcrumbContext.ts` that returns the four strings.

If a tour-internal LAYOUT file exists (`src/app/(app)/tours/[id]/layout.tsx`), MOUNT THE BREADCRUMB THERE so every child page inherits it automatically — this is the cleanest path. If no such layout exists, create one. This is the right abstraction.

### D.3 Coexistence with AdvanceShowContextBar

On `/tours/[id]/advance/[routingId]/page.tsx` (per-show), the existing `AdvanceShowContextBar` shows the Show-level context (artist + tour + day + venue + progress). Stack:

```
[TourBreadcrumb: ← Artist › Tour › Advance]
[AdvanceShowContextBar: Artist · Tour · Day · Date · Venue · City · Progress]
[Show content]
```

Both sticky, both stacked. Adjust the AdvanceShowContextBar's `top` offset so it sits below the TourBreadcrumb: `top: var(--lp-space-12)` (assuming TourBreadcrumb is ~48px tall). Verify with a screenshot smoke test.

### D.4 Acceptance

- [ ] Every tour-internal page has the persistent breadcrumb at the top
- [ ] Each segment (Artist, Tour) is clickable and navigates correctly
- [ ] "Back to tour" button works from every page
- [ ] On /advance/[routingId], TourBreadcrumb sits above AdvanceShowContextBar without visual collision
- [ ] Print stylesheet hides both
- [ ] No regression to existing tour-page layouts (DocumentCanvas-wrapped pages still render correctly underneath)
- [ ] No lint/type regressions

### D.5 Commit

```
feat(nav): persistent TourBreadcrumb on every tour-internal page

Sticky strip with [← Artist › Tour › Page] segments (each clickable)
plus a [Back to tour] button. Mounted via tours/[id]/layout.tsx so
every child page inherits it. Print:hidden.

On /advance/[routingId], stacks above the existing
AdvanceShowContextBar from UX22 phase 2 (TourBreadcrumb is tour-wide;
AdvanceShowContextBar is show-specific; both useful, both visible).

Made-with: Claude Code (nav redesign)
```

---

## E. Bug Reports access in account dropdown (~30 min)

You silently lost this when the A/B/C nav sprint dropped Bug Reports from the TopBar arrays. Fix: account dropdown gets a "Bug reports" entry, admin-gated.

### E.1 Implementation

In `src/components/shell/TopBar.tsx` (the `AccountMenuContent` component, which already houses things like Workspace / Sign out / DarkModeToggle):

- Resolve site-admin status server-side (use existing `getUserAndAdminStatus()` from `@/lib/site-admin`) and pass `isSiteAdmin: boolean` as a prop down to `AccountMenuContent` — OR fetch client-side via a small `/api/me/site-admin` route if cleaner. Server-side is cleaner; do that.
- Add a new entry between "Workspace" (or wherever Settings lives) and "Sign out":
  ```tsx
  {isSiteAdmin && (
    <Link href="/bugs" className="...same styling as other entries...">
      <Bug className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
      Bug reports
    </Link>
  )}
  ```
- Use the `Bug` icon from `lucide-react` (already available).

### E.2 Acceptance

- [ ] Adam (site admin) sees "Bug reports" in the account dropdown
- [ ] Click navigates to `/bugs`
- [ ] Non-admin users do NOT see the entry
- [ ] No lint/type regressions

### E.3 Commit

```
fix(topbar): restore Bug Reports access in account dropdown (admin-gated)

A/B/C nav sprint dropped Bug Reports from TopBar nav arrays without
restoring it elsewhere. Admin couldn't find /bugs without typing the
URL directly. Now it lives in the account dropdown, gated on
getUserAndAdminStatus() — invisible to non-admins.

Made-with: Claude Code (nav redesign)
```

---

## F. TopBar simplification (~30 min)

Now that Tour Hub has its own switching and tour-internal pages have breadcrumbs, the TopBar can simplify.

### F.1 Changes

In `src/components/shell/TopBar.tsx`:

- **Keep**: workspace logo (clicks → `/artists`, the new home), tour selector dropdown (still useful for cross-page tour switching), search, account avatar.
- **Keep `WORKSPACE_NAV`** for the workspace-level destinations: Dashboard / Personnel / Calendar / Equipment.
- **Keep `LIBRARY_MENU_ITEMS`** dropdown but verify it doesn't duplicate stuff that now lives in Artist Library. Likely-fine items: Templates, Performance, Venues. Remove any items that are now exclusively artist-scoped (deal memos, gear).
- **Remove redundancy**: if Library has a "Rider Packs" entry, leave it for now (rider packs are still findable workspace-wide) but recognise it's secondary navigation.

### F.2 Acceptance

- [ ] Logo click → `/artists`
- [ ] WORKSPACE_NAV still has Dashboard / Personnel / Calendar / Equipment
- [ ] Library dropdown is intact but reviewed for duplicates
- [ ] Account dropdown has Bug reports + Theme toggle + Workspace + Sign out
- [ ] No lint/type regressions

### F.3 Commit

```
chore(topbar): simplify after Tour Hub + breadcrumb introduction

Logo now routes to /artists (the new home). WORKSPACE_NAV unchanged.
Library dropdown reviewed and pruned of items now exclusively
surfaced via Artist Library. Account dropdown picked up Bug reports
in commit E.

Made-with: Claude Code (nav redesign)
```

---

## V. Verify (~30 min)

After A→F merge:

### V.1 Login flow

- Sign out, sign in fresh. Verify landing:
  - With multiple artists → `/artists` picker
  - With a single artist → `/artists/[that-id]` (skipped picker)
  - Deep-link `?next=/tours/X/advance` → respects, lands on advance after auth

### V.2 Artist Hub

- Click an artist card → `/artists/[id]`
- Two-column layout renders. Tours list is correct. Artist Library shows four cards.
- Click Riders card → existing rider system (with artist filter applied)
- Click each of Tech specs / Financial admin / Stage plot → stub empty-state pages
- Click "+ Add new artist" → `NewArtistSlideOver` opens
- Click "+ New tour" → new-tour flow opens

### V.3 Tour Hub

- Click a tour from Artist Hub → `/tours/[id]`
- Top strip shows `← [Artist]` and `Switch tour ▾`
- Hero shows tour name + status + dates
- Setup strip: chips reflect actual data (mix of green ✓ and gray —)
- Two big CTAs: Advance + Budget, with real counts and progress bars
- Click Advance → `/tours/[id]/advance`
- Click Budget → `/tours/[id]/budget`
- Setup chips clickable
- Secondary cards (Personnel / Routing / Channel list / Rooming) clickable
- Switch tour dropdown lists other tours of this artist; switching works

### V.4 Persistent breadcrumb

- On `/tours/[id]/advance` — see `← [Artist] › [Tour] › Advance` strip + Back to tour button
- On `/tours/[id]/budget` — same shape
- On `/tours/[id]/routing`, `/channel-list`, `/rooming`, `/payroll`, `/rider-packs`, `/files`, `/hire` — same shape
- On `/tours/[id]/advance/[routingId]` — TourBreadcrumb above AdvanceShowContextBar, no collision
- Click each segment → navigates back up the hierarchy correctly
- Click "Back to tour" → `/tours/[id]`

### V.5 Bug reports

- Sign in as Adam (site admin) → account avatar → see "Bug reports" entry → click navigates to `/bugs`
- Sign in as a non-admin user (or simulate by toggling the flag) → account avatar → no "Bug reports" entry

### V.6 No regressions

- Lint clean (75/121 baseline)
- Typecheck zero errors
- `next build --webpack` succeeds
- Spot-check pages that DIDN'T change (Dashboard, Personnel, Calendar, Equipment, Settings) — still render

If any check fails, fix before declaring done. Then report SHAs to Adam.

---

## When done

```
Nav redesign done.
Commits: <A-sha>, <B-sha>, <C-sha>, <D-sha>, <E-sha>, <F-sha>.
- Post-auth lands on /artists (with single-artist auto-skip).
- Artist Hub: tours list + Artist Library (Riders, Tech specs,
  Financial admin, Stage plot — last three stubbed pending data
  model).
- Tour Hub: Advance + Budget as 2px-orange-bordered primary CTAs
  with progress bars; Setup chip strip for build-once stuff;
  TimelineDashboard secondary; four small cards bottom row;
  Switch tour dropdown.
- Persistent TourBreadcrumb on every tour-internal page via
  tours/[id]/layout.tsx. Stacks cleanly with AdvanceShowContextBar
  on per-show pages.
- Bug Reports restored to account dropdown (admin-gated).
- TopBar simplified — logo routes to /artists, Library dropdown
  reviewed for duplicates with Artist Library.
- Lint + typecheck clean. Built via next build --webpack.
```

If Phase B's stub library category pages (`/artists/[id]/library/[category]`) feel too placeholder-y to ship, surface that explicitly in the report and we'll triage — building the data model for tech specs / financial admin / stage plot is its own follow-up sprint.
