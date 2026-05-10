# CC Sprint 7 — Artist surfaces redesign + Sprint 6 residuals

The largest sprint to date. Five phases. Combines four micro-fixes with three substantial visual redesigns plus one infrastructure phase.

The product has not shipped to users. Adam has explicit permission for breaking changes / downtime / churn through this sprint. Use it.

**Branch off `main`** (which now has Sprint 5 + 6 + 6.1 + 6.2 merged). Five commits + verify (1 → 2 → 3 → 4 → 5 → V). ~2 days CC time.

---

## 0. Required reading

- `CLAUDE.md` — particularly tokens, shell-v2, slide-over primitive, canonical entities
- `docs/handover/CC_STATE_2026_05_03.md`
- `docs/handover/CC_SPRINT_05_SWITCHER.md` and the §1.5 Visual Language Manifesto referenced from earlier sprints (Bloomberg-terminal density, three-elevation surface system, etc.)
- `src/app/(app)/artists/page.tsx` — the workspace landing page being redesigned in Phase 5
- `src/app/(app)/artists/[id]/page.tsx` — the artist detail page being redesigned in Phase 4
- `src/components/shell-v2/ProductHeader.tsx` and `src/components/shell-v2/ProductShell.tsx` — base for the new TourHeader (Phase 3)
- `src/app/api/artists/spotify-releases/route.ts` (or equivalent — find via `grep -rn spotify src/app/api`) — existing Spotify integration; Phase 2 extends it
- `src/components/advance/AdvanceShowHeader.tsx` — the visual blueprint to mirror for the new TourHeader strip
- `src/lib/entities/` and `src/lib/api/` — entity data access patterns
- `database/migrations/` — find the `artists` table schema; identify which fields hold logo/banner/spotify_image_url/branding JSONB

---

## 1. Hard rules

1. No new dependencies (Spotify SDK if used must already be in package.json — verify before importing).
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Five commits in numeric order: 1 → 2 → 3 → 4 → 5. One per phase.
7. **Verify before claiming.** Quote post-fix file:line.
8. **Visual fidelity is a hard requirement.** §1.5 Visual Language Manifesto applies in full: tokens-only, three-elevation surface system, Bloomberg-terminal density, dot-separator typography, mono numerics for figures, uppercase tracked-wider micro-labels, orange-as-functional-accent only. **No raw hex except orange transparency variants.** Every spacing/sizing/shadow/color via `var(--lp-*)`.
9. **Smooth animations.** Web Animations API for any non-trivial transitions (page entrances, hover lifts, modal opens). `prefers-reduced-motion` honored. No CSS keyframe wars with React state.
10. **Mockup sign-off before code on Phases 3, 4, and 5.** Write the layout as ASCII or detailed visual description in chat, wait for Adam's explicit "yes" or revisions, THEN write JSX. This protects against the iteration thrash Sprint 6 had on the trigger visual.
11. **No protocol skips.** Phases 2, 3, 4, 5 all have diagnosis-or-mockup steps. Phase 1 is mechanical residuals.
12. **Out-of-scope list at the bottom — leave them alone.**

---

## 2. Phase 1 — Sprint 6 residuals (~90 min, mechanical)

Four micro-fixes that don't need diagnosis. Quote post-fix lines, ship.

### 2.1 Sub-bug A — Pane animation reopens on browser back/fwd nav

**Symptom (Adam's smoke):** Press browser back/fwd while dropdown is open → dropdown closes (correct) → reopens on the next page (incorrect).

**Hypothesis:** Some state persists through navigation. Either (a) `dropdownState` is preserved across the soft nav and re-renders as 'open' on the destination page, or (b) an effect somewhere auto-opens the dropdown based on some condition that triggers on page mount.

**Investigation:** Read `ArtistTourSwitcher.tsx` for any `useEffect` / `useLayoutEffect` that could call `openDropdown` on mount. Check whether `dropdownState` initializes from a value that would be 'open' (e.g. localStorage). The expected initial state is 'closed' on every mount.

**Fix:** Make `dropdownState` always initialize to `'closed'` on mount. If anything restores it from elsewhere, remove that.

**Acceptance:**
- [ ] Open dropdown, navigate via clicking a tour, press browser back → dropdown does NOT reopen.
- [ ] Same for forward.
- [ ] Lint + typecheck clean.

### 2.2 Sub-bug B — Trigger label after tour creation shows "Pick a tour"

**Symptom (Adam's smoke):** After creating a new tour via the slide-over, dropdown shows the new tour BUT trigger label says "Pick a tour…" until you manually pick the new tour from the dropdown.

**Hypothesis:** Sprint 6.2 made `handleTourCreated` navigate via `router.push`. Path-aware hydration on the new URL should set `selectedTourId` from the path. But the trigger reads `tours.find(t => t.id === selectedTourId)` — if `tours` (wrapper local state) doesn't include the new tour at render-time, the find returns null → "Pick a tour".

The optimistic prepend in `handleTourCreated` adds the tour to `tours` state. But after `router.push`, the page re-renders, ProductHeader re-fetches `initialTours` server-side (which should include the new tour). The wrapper might re-mount or re-receive props with the new initialTours.

**Fix:** Ensure the wrapper's `tours` state stays in sync with the latest `initialTours` prop after navigation. Pattern:

```ts
// In wrapper:
useEffect(() => {
  // When initialTours prop updates (e.g. after router.push re-fetches),
  // sync local tours state to it. Preserves any optimistic additions
  // by merging by id.
  setTours((prev) => {
    const incomingIds = new Set(initialTours.map((t) => t.id));
    const optimisticOnly = prev.filter((t) => !incomingIds.has(t.id));
    return [...optimisticOnly, ...initialTours];
  });
}, [initialTours]);
```

Verify the merge logic preserves any in-flight optimistic-only entries. Trim if needed.

**Acceptance:**
- [ ] Create tour via slide-over → trigger immediately shows new tour name (not "Pick a tour").
- [ ] No need to refresh or re-pick.
- [ ] Lint + typecheck clean.

### 2.3 Sub-bug C — 1px border jiggle on dropdown open

**Symptom (Adam's smoke):** When trigger opens, left-border changes from 1px to 2px → contents shift 1px right.

**Fix:** Use `box-shadow: inset 2px 0 0 var(--color-lp-orange)` for the active state instead of changing `border-left`. Border stays 1px on all four sides; the orange accent is a separate inset shadow that doesn't affect layout.

```ts
boxShadow: open ? 'inset 2px 0 0 var(--color-lp-orange)' : undefined,
borderLeft: '1px solid var(--lp-border-strong)',  // always 1px
```

**Acceptance:**
- [ ] Open dropdown — orange left-accent appears WITHOUT shifting trigger contents.
- [ ] Close dropdown — accent disappears, no shift.
- [ ] Visual is identical otherwise.

### 2.4 Sub-bug D — Burn rate chart label formatting

**Symptom (Adam's smoke screenshot):** Burn rate chart in budget shows X-axis labels overlapping/garbled — looks like dates rendered without rotation or truncation.

**Investigation:** Find the burn rate chart component. Likely `src/components/budget/BudgetSummaryTab.tsx` or similar. Check what library renders it (Recharts, custom SVG, etc.).

**Fix:** Apply one of:
- Rotate X-axis labels 45°
- Truncate to short month-day format (e.g. "Mar 21")
- Show every Nth label only
- Use a wider chart container

Pick whichever fits the existing chart code with minimum churn.

**Acceptance:**
- [ ] Burn rate chart's X-axis labels are readable, not overlapping.
- [ ] Chart renders correctly across viewport sizes.
- [ ] Lint + typecheck clean.

### 2.5 Quote in report

- Post-fix `dropdownState` initializer.
- Post-fix `useEffect` syncing `initialTours` to local `tours` state.
- Post-fix box-shadow + border block on the trigger.
- Post-fix burn rate chart label config.

### 2.6 Commit

`fix(shell-v2,budget): Sprint 6 residuals — pane back/fwd reopen, trigger label after create, 1px jiggle, burn rate labels`

---

## 3. Phase 2 — Spotify image fetch reliability (~90 min)

### 3.1 Goal

Phases 4 and 5 both want to render artist hero banners + profile images. Today the system relies on `branding.logo_url` and a `spotify_image_url` field that's "had issues pulling from the API" (Adam's words). This phase makes that reliable.

### 3.2 Investigation step (post diagnosis to chat first)

1. `grep -rn spotify src/` — list every Spotify-related file. Identify the existing client/API integration.
2. Find the auth flow. Is it OAuth (user-authenticated, requires Spotify login) or Client Credentials (server-only, no user auth, suitable for fetching public artist data)?
3. Find the schema field(s) that store Spotify data. Likely `artists.spotify_id`, `artists.spotify_image_url`. Check if there's a `branding` JSONB with `spotify_image_url` inside.
4. Find what's broken: does the fetch fail silently? Returns null? Stale cache?
5. Identify whether the existing `/api/artists/spotify-releases` route is the only Spotify integration or whether there's more (image fetch, search).

Post diagnosis:

```
Phase 2 diagnosis:
- Existing files: <list>
- Auth flow: <OAuth or Client Credentials>
- Schema fields used: <list>
- What's broken: <one paragraph>
- Fix scope: <what changes>
```

Wait for Adam's sign-off.

### 3.3 Fix scope (subject to diagnosis)

The likely shape:

1. Add or extend a server-side route `GET /api/artists/[id]/spotify-image` that returns the artist's Spotify images (640px / 320px / 160px URLs) + name + genres + followers.
2. Use Client Credentials flow (no user auth needed for public artist data). Cache the access token in memory or KV for 1 hour.
3. Cache the per-artist Spotify response for 24 hours (image URLs change rarely; reduces API load).
4. The fallback chain for any consumer (Phase 4 + 5):
   - `branding.logo_url` (user-uploaded — defer the upload UI to Sprint 8)
   - `spotify_image_url` from DB (cached snapshot)
   - Live fetch via the new endpoint if `spotify_id` is set
   - Fallback: initials chip on brand-orange background

5. Environment variables needed: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. If they don't exist, document that Adam needs to add them to Vercel + .env.local.

If Spotify can't be fixed (no client credentials available, API completely broken), document that and use a gradient-from-artist-name color as the banner fallback. Phases 4 and 5 must work even without Spotify.

### 3.4 Acceptance

- [ ] `GET /api/artists/[id]/spotify-image` returns artist images + meta when artist has a `spotify_id` set.
- [ ] Returns 404 cleanly when no `spotify_id`.
- [ ] Cached on subsequent calls (verify with a `console.log` or response header showing cache hit).
- [ ] If env vars missing, route returns a clean error with instructions, not a 500.
- [ ] Lint + typecheck clean.

### 3.5 Quote in report

- The new/modified route handler.
- Auth flow code (token fetch + caching).
- Cache strategy for per-artist responses.
- Documented env var requirements.

### 3.6 Commit

`feat(api): Spotify artist image + meta endpoint with cache + fallback (Phase 2 of Sprint 7)`

---

## 4. Phase 3 — TourHeader strip on product pages (~120 min)

### 4.1 Goal

Adam: "On every product page, we need to add a big artist/tour header. I know we have the switcher top left, but it needs to be clearer than that."

Solution: a TourHeader strip mounted above the page body, below ProductHeader, on `/budget/[X]`, `/advance/[X]`, `/operations/[X]`. Carries the tour's identity prominently — the artist's visual + tour name + tour-level stats — so the operator never has to wonder "which tour am I editing."

### 4.2 Mockup (post to chat for sign-off, then implement)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [Lowpass]  [Switcher: GN · SA Aug'26]                              BUDGET      │  ← ProductHeader (existing, unchanged)
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ┌─[60px]──┐    ARTIST · GOOD NEIGHBOURS                                     │
│   │  LOGO   │    South Africa Aug '26                                          │
│   │         │    15 SHOWS · AUG 24 → SEP 7 · £45K · 67% COMPLETE             │
│   └─────────┘                                                                  │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│ ... product page body (existing, unchanged) ...                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Specific spec:**

- **Container**: full-width strip below ProductHeader. ~96px tall. `background: var(--lp-panel)`. Bottom border `1px solid var(--lp-border-strong)`.
- **Padding**: `var(--lp-space-4)` vertical, `var(--lp-space-6)` horizontal.
- **Layout**: flex-row, gap `var(--lp-space-4)`.
- **Logo**: 60px square. Uses fallback chain from Phase 2 (logo → spotify → initials). Token-rounded corners (`var(--lp-radius-md)`). Object-fit: cover. Center-anchored.
- **Text block**:
  - Row 1: micro-label "ARTIST" (uppercase, tracked-wider, 11px, `var(--lp-text-tertiary)`) · dot · artist name (font-medium, 14px, `var(--lp-text)`).
  - Row 2: tour name (28px, font-semibold, `var(--lp-text)`, line-height 1.1). The visual hero.
  - Row 3: stats line — uppercase tracked-wider micro-labels separated by " · ". `var(--lp-text-secondary)` 11px.
- **Stats row content** (per product):
  - Budget: `<N> SHOWS · <date range> · <total budget> · <% spent>`
  - Advance: `<N> SHOWS · <date range> · <% complete> · <pending count> PENDING`
  - Operations: `<N> SHOWS · <date range> · <personnel count> CREW · <bus/flight count> LEGS`

- **Right-side action area** (optional, ~120px): a small "Edit tour" or context action button. Stays mounted, semi-transparent, only shown on hover OR always-visible per Adam's call.

**Empty/loading states**:
- Logo loading: skeleton box.
- No image at all: initials chip in `var(--color-lp-orange)`.

**Animation**: on first mount, the entire strip fades in with 4px translateY-down over 200ms. Reduce-motion: instant.

### 4.3 Implementation notes

- New file: `src/components/shell-v2/TourHeader.tsx` (or `src/components/tour/TourHeader.tsx` — pick by existing pattern).
- Server-fetched props: `artist` (id, name, logo url, fallback chain resolved), `tour` (id, name, dates, status, currency).
- Stats fetched server-side per-product. Pass via props from each page.tsx.
- Mount in: `/budget/[tourId]/layout.tsx` (or page.tsx), `/advance/[tourId]/layout.tsx`, `/operations/[tourId]/layout.tsx`. If no layouts exist for these, create them so the TourHeader is shared across sub-routes.

### 4.4 Acceptance

- [ ] All three product surfaces (Budget, Advance, Operations at the tour level) render TourHeader above the page body.
- [ ] Logo resolves through the Phase 2 fallback chain — image when available, initials chip otherwise.
- [ ] Tour name is the visual hero. Hierarchy is clear.
- [ ] Stats line content matches the per-product spec.
- [ ] Mounts above page-specific headers (e.g. AdvanceShowHeader) without overlap.
- [ ] Lint + typecheck clean.

### 4.5 Quote in report

- Post-mockup sign-off timestamp.
- New `<TourHeader>` file (full content if ≤120 lines, otherwise the imports + main render block).
- Mount sites in each product's page.tsx / layout.tsx.

### 4.6 Commit

`feat(shell-v2): TourHeader strip on product pages (Phase 3 of Sprint 7)`

---

## 5. Phase 4 — `/artists/[id]` artist detail page redesign (~3 hr)

### 5.1 Goal

Replace the current "small accidental name + icon" with a full artist HQ page. Hero banner, profile card, stats, calendar, product entry points, recent activity, new releases. Tour-manager-grade information density.

### 5.2 Mockup (post to chat for sign-off, then implement)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [Lowpass]  [Switcher]                                                  HOME    │  ← ProductHeader (existing)
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ┌── HERO BANNER (full-width, 240px tall, Spotify image cropped+blurred) ──┐│
│   │                                                                          ││
│   │                                                                          ││
│   │                                                                          ││
│   │  [88px LOGO]                                                            ││
│   │                                                                          ││
│   └──────────────────────────────────────────────────────────────────────────┘│
│                                                                                │
│   ELLA LANGLEY                                                  [Edit profile]│
│   COUNTRY · 1.2M MONTHLY LISTENERS · LINKED ON SPOTIFY                        │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│  ACTIVE TOURS · SHOWS THIS MONTH · PERSONNEL ASSIGNED · BUDGET COMMITTED      │
│  1                  0                  0                       £9K             │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   NEXT 30 DAYS                                                       0 dates   │
│   [calendar widget — existing, kept]                                           │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ┌─── OPERATIONS ───┐  ┌─── BUDGET ───┐  ┌─── ADVANCE ───┐                  │
│   │ Routing, files,  │  │ Line items,  │  │ Per-show     │                  │
│   │ rooming, gear    │  │ payroll,     │  │ advance,     │                  │
│   │                  │  │ deal memos   │  │ contacts     │                  │
│   │ [icon]          ›│  │ [icon]      ›│  │ [icon]      ›│                  │
│   └──────────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   NEW RELEASES                                              FROM SPOTIFY      │
│   [3-column grid of recent albums/singles, if Spotify linked]                 │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   RECENT ACTIVITY                                              LAST 24 HOURS  │
│   ... existing recent activity table, kept ...                                │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Specific spec:**

- **Hero banner**: full-width, 240px tall. Background = Spotify image scaled `cover` + a `linear-gradient(to bottom, transparent 0%, var(--lp-bg) 100%)` overlay so the bottom fades into the page. If no Spotify image, use a gradient-from-artist-name colour fallback. Avatar/logo overlaid bottom-left at 88px square, with a subtle white border (1px `rgba(255,255,255,0.3)`) and `var(--lp-shadow-md)` drop shadow.
- **Identity strip below banner**:
  - Artist name 32px font-bold `var(--lp-text)`.
  - Meta line: GENRE · MONTHLY LISTENERS · SPOTIFY LINK STATUS, all uppercase tracked-wider 11px `var(--lp-text-tertiary)`.
  - Right-side button: "Edit profile" (chip-style, opens slide-over for artist edit — but DO NOT build the slide-over in this sprint; defer to logo-upload sprint. For now wire it to `/artists/[id]/edit` or similar legacy route).
- **Stats strip**: existing component, kept. Verify it renders with current data.
- **Calendar widget**: existing component, kept. Verify it renders.
- **Product cards**: redesigned. Three-column grid, each card ~200px tall. Match the visual language of the rest of the app — `var(--lp-panel)` background, 1px border, hover lifts to `var(--lp-panel-hover)` + 1px translate-up. Each card has icon + name + 1-line description + chevron-right. Click → navigates to `/{product}/{recent-tour-id}` for that artist.
- **New Releases**: if `spotify_id` set, render 3-column grid of latest album/single from `/api/artists/spotify-releases` (existing endpoint). If no Spotify, hide the section.
- **Recent Activity**: existing component, kept.
- **Spacing**: `var(--lp-space-8)` between sections. `var(--lp-space-6)` page-edge padding.

### 5.3 Animation

- Hero banner fades in over 300ms on first mount.
- Identity strip slides up 8px while fading in (200ms after banner starts).
- Sections below stagger-fade-in 50ms apart.
- All respect `prefers-reduced-motion`.

### 5.4 Acceptance

- [ ] Hero banner renders with Spotify image (or gradient fallback).
- [ ] Logo overlay positioned bottom-left of banner, 88px.
- [ ] Identity strip with artist name, meta, Edit button.
- [ ] Stats strip preserved + renders.
- [ ] Calendar preserved + renders.
- [ ] Product cards redesigned, click navigates to recent-tour URL.
- [ ] New Releases section conditional on Spotify link.
- [ ] Recent Activity preserved + renders.
- [ ] Stagger animation smooth, reduce-motion respected.
- [ ] Hex grep returns 0 in any new files.
- [ ] Lint + typecheck clean.

### 5.5 Quote in report

- Post-mockup sign-off timestamp.
- Hero banner JSX + banner-image fallback chain.
- Identity strip JSX.
- Product card component (if extracted).
- Stagger animation effect.

### 5.6 Commit

`feat(home): /artists/[id] artist detail page redesign (Phase 4 of Sprint 7)`

---

## 6. Phase 5 — `/artists` workspace landing page redesign (~3 hr)

### 6.1 Goal

This is the FIRST page a returning user sees. Currently it's bare and on the old design language. Redesign as a workspace landing — orient, surface what's hot, provide quick paths to working surfaces.

### 6.2 Mockup (post to chat for sign-off, then implement)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [Lowpass]                                                            [User]   │  ← Simple workspace top bar (no left rail, no switcher, no product nav)
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   WORKSPACE                                                                    │
│   Lowpass                                                                      │
│                                                                                │
│   6 ARTISTS · 3 ACTIVE TOURS · 47 SHOWS THIS MONTH · £4.5M COMMITTED         │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ┌─── PICK UP WHERE YOU LEFT OFF ───────────────────────────────────────────┐│
│   │                                                                          ││
│   │  [logo]  GOOD NEIGHBOURS · South Africa Aug'26                          ││
│   │          Last edit: Budget — Production line items, 2h ago              ││
│   │                                                                          ││
│   │                                          [Resume Budget →]              ││
│   │                                                                          ││
│   └──────────────────────────────────────────────────────────────────────────┘│
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ARTISTS · 6                                                  [+ NEW ARTIST] │
│                                                                                │
│   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐             │
│   │ [Banner crop]    │ │ [Banner crop]    │ │ [Banner crop]    │             │
│   │   [88px logo]    │ │   [88px logo]    │ │   [88px logo]    │             │
│   │ ELLA LANGLEY     │ │ GOOD NEIGHBOURS  │ │ GORILLAZ         │             │
│   │ 1 active · 8 m   │ │ 2 active · 12 m  │ │ 0 active · — m   │             │
│   │ Next: 21 Mar TAB │ │ Next: 24 Aug CPT │ │ —                │             │
│   └──────────────────┘ └──────────────────┘ └──────────────────┘             │
│   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐             │
│   │ ...              │ │ ...              │ │ ...              │             │
│                                                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│   ACTIVITY                                                  LAST 24 HOURS    │
│   [global activity feed — most recent 10 entries across all artists]          │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Specific spec:**

- **Top bar**: existing `<TopBar>` component or a simplified workspace-level top bar. NO ProductRail (no artist selected). NO switcher (workspace level). User avatar + Cmd+K + Settings on the right. Workspace name visible somewhere (probably top-left where the lp logo is).
- **Workspace identity strip**: under the top bar. Micro-label "WORKSPACE" + workspace name (32px font-semibold) + stats line (uppercase tracked-wider 11px micro-labels).
- **"Pick up where you left off" card**:
  - Full-width panel with `var(--lp-panel)` background, 1px border, generous padding.
  - Most recent tour the user touched (resolve via `tour_audit_log` or similar — fall back to most-recently-updated tour if no audit log).
  - Logo + artist · tour title.
  - Last edit context line (e.g. "Budget — Production line items, 2h ago").
  - Primary "Resume" button on the right (orange) — links to the matching product surface.
  - On hover: card lifts 1px translateY + shadow upgrade.
- **Artists section**:
  - Header: "ARTISTS · {count}" + right-aligned "+ NEW ARTIST" button (opens existing artist creation flow if one exists; otherwise navigates to `/artists/new` placeholder — DO NOT build artist creation in this sprint).
  - 3-column grid of artist cards. Card spec:
    - 280px wide, 320px tall.
    - Top: 160px banner image (Spotify cropped, or gradient fallback).
    - Bottom: 160px content area with `var(--lp-panel)` bg.
    - Logo overlay: 88px, bottom-left of banner half-extending into the content area (Z up).
    - Artist name (uppercase tracked-wider, 14px, font-medium).
    - Meta: `<N> active · <N> months upcoming` (mono numerics, 12px, `var(--lp-text-secondary)`).
    - Optional: "Next: <date> <venue-short>" if there's an upcoming show.
  - Click anywhere on card → navigates to `/artists/[id]`.
  - Hover: card lifts 1px + shadow upgrade.
- **Activity feed**:
  - Workspace-wide. Last 24 hours (or last 10 entries, whichever shorter).
  - Compact rows: timestamp · actor · action · entity.
  - Click row → navigates to the entity.

### 6.3 Animation

- Identity strip + Pick Up card fade-in 200ms on mount.
- Artist grid stagger-fade-in 30ms per card, starting 100ms after page mount.
- Activity feed fade-in last.
- Reduce-motion: instant.

### 6.4 Acceptance

- [ ] No ProductRail / no switcher on this page (workspace level).
- [ ] Workspace identity strip with stats.
- [ ] Pick Up card resolves and shows a relevant most-recent context.
- [ ] Artist grid with banner + logo + meta.
- [ ] Click artist card → navigates to `/artists/[id]` (Phase 4 surface).
- [ ] "+ NEW ARTIST" button present (functionality deferred — wire to placeholder).
- [ ] Activity feed renders.
- [ ] Stagger animation smooth, reduce-motion respected.
- [ ] Lint + typecheck clean.

### 6.5 Quote in report

- Post-mockup sign-off timestamp.
- New page file `/artists/page.tsx` post-redesign.
- Pick Up card component.
- Artist card component.
- Workspace stats query.

### 6.6 Commit

`feat(home): /artists workspace landing page redesign (Phase 5 of Sprint 7)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all five phases land.

1. Phase 1 sub-bug A — open dropdown, navigate via tour click, press browser back → dropdown does NOT reopen. PASS / FAIL.
2. Phase 1 sub-bug B — create tour via slide-over → trigger immediately shows new tour name. PASS / FAIL.
3. Phase 1 sub-bug C — open dropdown, content does NOT shift 1px. PASS / FAIL.
4. Phase 1 sub-bug D — burn rate chart labels readable, not overlapping. PASS / FAIL.
5. Phase 2 — `GET /api/artists/[id]/spotify-image` returns 200 with image URLs for an artist with `spotify_id`. PASS / FAIL.
6. Phase 3 — TourHeader visible on `/budget/[X]`, `/advance/[X]`, `/operations/[X]`. Logo + artist name + tour name + stats. PASS / FAIL.
7. Phase 4 — `/artists/[id]` renders hero banner + logo + identity strip + stats + calendar + product cards + New Releases (if linked) + Recent Activity. Stagger animation smooth. PASS / FAIL.
8. Phase 5 — `/artists` renders workspace identity + Pick Up card + artist grid + activity feed. Click artist → navigates to `/artists/[id]`. Stagger animation smooth. PASS / FAIL.
9. `prefers-reduced-motion: reduce` set in DevTools → all animations collapse to instant. PASS / FAIL.
10. Console clean on every page nav. No "Maximum update depth," no React errors.
11. Hex grep on every new component file: `grep -rn "#[0-9a-fA-F]\{3,8\}" src/components/{shell-v2/TourHeader,...}.tsx` returns zero matches.
12. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

If 6, 7, 8 fail visually — pause and surface to Adam with screenshots before proceeding.

---

## When done — report exactly this format

```
Sprint 7 done. Branch: feat/sprint-7-artist-surfaces
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2,budget): Sprint 6 residuals
- 2: <hash> feat(api): Spotify artist image endpoint
- 3: <hash> feat(shell-v2): TourHeader strip on product pages
- 4: <hash> feat(home): /artists/[id] redesign
- 5: <hash> feat(home): /artists workspace redesign

Phase 2 diagnosis posted at <ts>, signed off at <ts>.
Phase 3 mockup posted at <ts>, signed off at <ts>.
Phase 4 mockup posted at <ts>, signed off at <ts>.
Phase 5 mockup posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] dropdownState init + initialTours sync effect + box-shadow trigger + chart labels
[Phase 2] route handler + auth + cache + env vars
[Phase 3] TourHeader.tsx + mount sites
[Phase 4] hero banner + identity + product cards + sections
[Phase 5] workspace top bar + Pick Up + artist grid + activity feed

V.1-12 results:
1. <pass/fail>
... (all 12)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Logo upload UI** — Adam wants user-uploaded logos, but the upload UI + storage flow is a separate sprint after this lands. For now, the fallback chain (logo→spotify→initials) handles the absence gracefully.
2. **Artist creation flow** — "+ NEW ARTIST" button wires to a placeholder route; the actual creation form/flow is a separate sprint.
3. **Edit profile slide-over** for `/artists/[id]` — the "Edit profile" button on the artist detail page wires to `/artists/[id]/edit` or similar legacy/placeholder. Don't build the new edit slide-over in this sprint.
4. **Workspace stats query optimization** — if the workspace stats query is slow, defer perf to a future sprint.
5. **Advance / Operations / Budget internals** — TourHeader mounts ABOVE these pages. Don't refactor the page interiors.
6. **Mobile responsive** — desktop only. Mobile is m/ route group, separate effort.
7. **Cmd+K palette integration** — separate sprint.
8. **Spotify OAuth linking flow** — Phase 2 uses Client Credentials (server-only). User-flow Spotify linking is a separate sprint.
9. **`/artists/[id]/edit` page redesign** — keep the legacy edit page as-is.
10. **Five baseline `react-hooks/set-state-in-effect` errors in ArtistTourContext** — separate cleanup sprint.

If you find another bug while doing this sprint — note it in the report's "out of scope, deferred" section. Don't fix it.
