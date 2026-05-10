# CC Sprint 8 — Sprint 7 polish + full artist/tour builders

Five phases. Two are mechanical (Phase 1 + Phase 3). Three need sign-off (Phase 2 mockup, Phase 4 diagnosis, Phase 5 dual mockup).

Sprint 7 shipped real visual wins. This sprint closes the polish gaps Adam flagged on smoke and builds the canonical artist + tour creation UX.

**Branch off `main`** (Sprint 7 merged). Five commits + verify (1 → 2 → 3 → 4 → 5 → V). ~1.5 days CC time.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_07_ARTIST_SURFACES.md` (context)
- `src/components/artists/ArtistHero.tsx` — banner blur target (Phase 1)
- `src/components/shell-v2/TourHeader.tsx` and `src/components/shell-v2/TourHeaderClient.tsx` — scroll-collapse target (Phase 2)
- `src/components/advance/AdvanceOverviewStatsStrip.tsx` — being retired (Phase 2)
- `src/app/(app)/advance/[tourId]/page.tsx` — ↑ removal site
- `src/components/artists/NewReleasesGrid.tsx` and `src/app/api/artists/spotify-releases/route.ts` — Phase 3 target
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — Phase 4 target (close-on-pathname effect at line ~286 was added in Sprint 7 Phase 1 sub-bug A; suspected over-eager close)
- `src/components/shell-v2/TourCreateSlideOver.tsx` — Phase 5 expansion target
- `src/components/tours/TourWizard.tsx` — 582-line existing full-page tour creation flow; Phase 5 mirrors its field set into the slide-over
- `src/app/api/spotify/search/route.ts` — existing Spotify search endpoint (used by Phase 5's ArtistCreateSlideOver Spotify-link UX)
- `database/migrations/` — find `artists` table schema for full field list (name, slug, branding, spotify_id, spotify_image_url, spotify_banner_url)

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Five commits in numeric order: 1 → 2 → 3 → 4 → 5. One per phase.
7. Verify before claiming. Quote post-fix file:line.
8. Visual fidelity is a hard requirement. Tokens-only. §1.5 Visual Language Manifesto applies in full.
9. Smooth animations are a hard requirement. Adam: "I had janky transitions, I always try and find them." Web Animations API + `prefers-reduced-motion`. Phase 2's scroll-collapse and Phase 4's pane transition are the user-visible animation tests; both must be visibly smooth on Adam's smoke.
10. **Mockup sign-off before code on Phase 2 (TourHeader scroll-collapse)**. **Diagnosis sign-off before code on Phase 4 (smooth pane transition)**. **Dual mockup sign-off on Phase 5 (ArtistCreateSlideOver + TourCreateSlideOver expansion)**. Phases 1 + 3 are mechanical, no sign-off needed.
11. **Batch the sign-off requests.** Like Sprint 7: ship Phase 1 + 3 first as mechanical commits, then post Phase 2 mockup + Phase 4 diagnosis + Phase 5 dual mockup as ONE batched chat message. Adam replies with all sign-offs in one message. Then Phase 2 + 4 + 5 + V ship in one push.
12. No protocol skips.
13. Out-of-scope list at the bottom — leave them alone.

---

## 2. Phase 1 — Spotify banner blur strength (~15 min, mechanical)

### 2.1 Symptom (Adam's smoke)

> "5 - not blurred as much as looks very pixelated, but I like the vision!"

The Spotify image is being scaled from ~640px native up to ~1400px wide for the 240px banner. Native blur of 2px isn't enough to mask the pixelation.

### 2.2 Fix

In `src/components/artists/ArtistHero.tsx` (Phase 4 of Sprint 7), find the hero banner JSX. The current `filter: blur(2px) brightness(0.85)` (or equivalent) gets bumped to `blur(12px) brightness(0.7)`. Higher blur masks pixelation; slightly stronger brightness reduction keeps text readable over the banner.

If the banner uses `backdrop-filter` instead of `filter`, same change.

If you find the blur is currently applied via inline style / CSS-var, swap the value. Don't introduce a new token unless the value will be reused elsewhere — single-site magic value is fine for now (12px blur is purpose-specific).

### 2.3 Acceptance

- [ ] Hero banner on `/artists/[id]` reads as blurred, not pixelated.
- [ ] Text overlay (artist name, meta) remains readable.
- [ ] No regression on the gradient fallback when no Spotify image.
- [ ] Lint + typecheck clean.

### 2.4 Quote in report

- The post-fix `filter` / `backdrop-filter` line.

### 2.5 Commit

`fix(home): bump hero banner blur to mask Spotify image pixelation (Phase 1 of Sprint 8)`

---

## 3. Phase 3 — NewReleasesGrid: 5-cap + artwork (~30 min, mechanical)

### 3.1 Symptom (Adam's smoke)

> "7 - PASS - it looks good. lets limit to five latest releases and make sure it pulls artwork through too."

Two changes to `NewReleasesGrid` + the underlying API.

### 3.2 Fix scope

**(a)** `src/app/api/artists/spotify-releases/route.ts`:

Currently strips images from the Spotify response per CC's Sprint 7 deferred note #10. Change the projection to include the image URL (typically `images[0].url` for the largest, or `images[1].url` for the medium thumbnail — pick the size that fits 80px display). Add `image_url` to each returned album/single item.

**(b)** `src/components/artists/NewReleasesGrid.tsx`:

- Limit to 5 releases: `.slice(0, 5)` after the workspace-wide filter.
- Render `image_url` as the cover thumbnail (80×80 `<img>` with `object-fit: cover`, `border-radius: var(--lp-radius-md)`).
- Fallback if no image: keep the placeholder square but add a subtle gradient.

### 3.3 Acceptance

- [ ] `/artists/[id]` shows max 5 releases.
- [ ] Each release card shows the album/single artwork.
- [ ] Falls back gracefully when no image (gradient placeholder).
- [ ] Lint + typecheck clean.

### 3.4 Quote in report

- Post-fix `image_url` field in API response.
- Post-fix `.slice(0, 5)` and `<img>` render in NewReleasesGrid.

### 3.5 Commit

`feat(home): NewReleasesGrid pulls artwork + limits to 5 latest (Phase 3 of Sprint 8)`

**Push commits 1 + 3 together (or separately back-to-back). Then post the batched sign-off requests.**

---

## 4. Phase 2 — TourHeader scroll-collapse + AdvanceOverviewStatsStrip removal

**Mockup sign-off required.** Post the mockup in chat with the format below; wait for Adam's "yes" / revisions; then implement.

### 4.1 Goal

Adam's smoke: TourHeader passes, but on scroll it should collapse to a smaller sticky header with the same info compressed into one line. Plus: the existing `AdvanceOverviewStatsStrip` on `/advance/[tourId]/page.tsx` (Tour Progress / Shows Complete / Shows Pending / Days Until First / Days Until Last) is now redundant since TourHeader carries equivalent stats — remove it.

### 4.2 Mockup spec (post to chat for sign-off)

**Expanded state (top of page, default):**

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Lowpass] [Switcher: GN · SA Aug'26]                          BUDGET   │ ← ProductHeader
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─[60×60]─┐    ARTIST · GOOD NEIGHBOURS                              │ ← TourHeader expanded (96px)
│  │  LOGO   │    South Africa Aug '26                                   │
│  │         │    15 SHOWS · AUG 24 → SEP 7 · £45K · 67% COMPLETE       │
│  └─────────┘                                                            │
│                                                                         │
├────────────────────────────────────────────────────────────────────────┤
│ ... page body, scrollable ...                                          │
```

**Compressed state (after user scrolls past the expanded header):**

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Lowpass] [Switcher]                                          BUDGET   │
├────────────────────────────────────────────────────────────────────────┤
│ [40px] GOOD NEIGHBOURS · South Africa Aug '26 · 67% COMPLETE          │ ← TourHeader compressed (~48px sticky)
├────────────────────────────────────────────────────────────────────────┤
│ ... page body continues ...                                            │
```

**Compressed state spec:**

- Sticky to the top of the scroll container, just below ProductHeader.
- ~48px tall.
- Padding: `var(--lp-space-2)` vertical, `var(--lp-space-6)` horizontal.
- Avatar: 40px (smaller than expanded's 60px). Same fallback chain.
- Single-row text: `<artist name> · <tour name> · <key stat>`. Dot separators (`var(--lp-text-tertiary)`).
- Artist name: font-medium 14px `var(--lp-text)`.
- Tour name: regular 14px `var(--lp-text-secondary)`.
- Key stat (one stat picked per product — Adam's call):
  - Budget: `<spentPercent>% SPENT`
  - Advance: `<completePercent>% COMPLETE`
  - Operations: `<crewCount> CREW`
- Right-side: keep the "Edit tour" chip (small).

**Transition: smooth.** This is the part Adam will fixate on. Pick one of:

- **(A) Scroll-driven CSS animations** — `animation-timeline: scroll()` / `animation-range`. Native browser support in evergreen Chrome 115+, Safari 17.4+. Smoothest, GPU-driven, no JS. Some progressive enhancement risk.
- **(B) IntersectionObserver + Web Animations API** — observe a sentinel element below the expanded header. When it scrolls out of viewport, animate the compressed version in via `el.animate()`. Pure JS, more compatible, slightly more code.
- **(C) IntersectionObserver + CSS class toggle** — same observer, but the compressed-vs-expanded states are CSS classes. Use CSS `transition` for the transform. JavaScript only manages the class.

CC: pick one. Document the trade-off in the mockup post.

**No double-render.** Don't render BOTH expanded and compressed simultaneously (causes layout jump). Either one element that morphs (CSS-driven), or two elements where the compressed is `position: fixed` and only opacity-fades-in once expanded scrolls out of view (sentinel pattern).

### 4.3 AdvanceOverviewStatsStrip removal

Delete the `<AdvanceOverviewStatsStrip>` mount from `src/app/(app)/advance/[tourId]/page.tsx`. The component file can stay on disk for reference (no other consumers) — flag in the deferred section that it's now orphaned and can be deleted in cleanup.

ALSO: mount `<TourHeader>` on `/advance/[tourId]/page.tsx` (overview page). Sprint 7 only mounted TourHeader on the per-show route. Add it to the overview too. Stats: same `<percentComplete>` and `<showCount>` data already available.

### 4.4 Acceptance

- [ ] On `/budget/[X]` / `/advance/[X]` / `/advance/[X]/[Y]` / `/operations/[X]`: scroll past the expanded TourHeader → compressed sticky version smoothly fades in.
- [ ] Scroll back up → compressed fades out, expanded becomes visible again.
- [ ] Transition is genuinely smooth — no flicker, no flash, no jump. Eye sees a clear interpolation.
- [ ] `prefers-reduced-motion: reduce` → instant swap, no animation.
- [ ] `<AdvanceOverviewStatsStrip>` no longer renders on `/advance/[tourId]/page.tsx`.
- [ ] `<TourHeader>` IS mounted on `/advance/[tourId]/page.tsx` (overview).
- [ ] No double-render artifacts (both expanded + compressed visible simultaneously).
- [ ] Lint + typecheck clean.

### 4.5 Quote in report

- Post-mockup sign-off timestamp.
- Implementation choice (A / B / C) and rationale.
- The compressed-state JSX or CSS.
- The mount addition for overview page.
- The removed AdvanceOverviewStatsStrip line.

### 4.6 Commit

`feat(shell-v2): TourHeader scroll-collapse to compact sticky bar (Phase 2 of Sprint 8)`

---

## 5. Phase 4 — Smooth pane transition + back-to-artists button

**Diagnosis sign-off required** before fixing the smooth transition. The back-to-artists button is mechanical and can ship in the same commit.

### 5.1 Symptom (Adam's smoke)

> "still no smooth scroll between artist/tour in the picker, it just closes and re-opens"

User clicks an artist in the artists pane. Expected: smooth cross-slide to tours pane. Observed: dropdown closes, then re-opens on the new page (after artist click triggered a navigation on /artists/[X] paths).

### 5.2 Hypothesis (confirm or refute in diagnosis post)

Sprint 7 Phase 1 sub-bug A added a `useEffect` in `ArtistTourSwitcher.tsx` (~line 286) that closes the dropdown on every `pathname` change:

```ts
useEffect(() => {
  queueMicrotask(() => {
    setDropdownState('closed');
    setExitingPane(null);
  });
}, [pathname]);
```

That fix was for the back/fwd-reopen bug. But it's too aggressive: when the user clicks an artist on `/artists/[X]`, `handleArtistClick` calls BOTH `transitionToPane('tours', 'forward')` (start cross-slide) AND `router.push('/artists/[new-id]')` (changes pathname). The pathname-change effect fires mid-cross-slide → dropdown closes immediately. New page mounts with dropdown closed. User sees: close + reopen pattern.

### 5.3 Investigation step (post diagnosis to chat)

1. Read `ArtistTourSwitcher.tsx:286` (or wherever the close-on-pathname effect is). Quote it.
2. Trace what events fire `setDropdownState('closed')`. Are there other paths besides this effect?
3. Verify the back/fwd reopen bug is the SAME bug — i.e. is the pathname-change effect the right gate, just too eager? Or is there a separate state-preservation issue across navigations that needs different handling?
4. Pick a fix:
   - **(A)** Replace the pathname-change effect with a `popstate` event listener — fires only on browser back/fwd, not on programmatic `router.push`/`router.replace`. Cleanest.
   - **(B)** Keep the pathname-change effect but skip-close when `exitingPane !== null` (mid-transition). Less clean — leaves an effect-driven mechanism that other code might trip later.

Post diagnosis:

```
Phase 4 diagnosis:
- Loop site / fix site: <file:line>
- Why current effect is over-eager: <one paragraph>
- Picked: <A or B>
- Why: <one sentence>
- Fix scope: <what changes>
- Confidence: <high / medium / low>
```

Wait for Adam's sign-off.

### 5.4 Back-to-artists button (mechanical, no sign-off needed)

In the artists-pane render of the dropdown, add a small subtle button at the top:

```
┌─ DROPDOWN PANEL ─┐
│  ← All artists   │ ← NEW: small chevron + "All artists" label
│                  │   navigates to `/artists` workspace landing
│  ARTISTS · 6     │
│  [artist row]    │
│  [artist row]    │
│  ...             │
└──────────────────┘
```

Spec:

- Visible only in the artists pane (NOT in the tours pane — the tours pane already has its own back-chevron that returns to artists).
- Position: top of dropdown, above the "ARTISTS · {count}" header.
- Style: 13px `var(--lp-text-secondary)`, hover `var(--lp-text)`. Leading `<ChevronLeft size={12} />`. Subtle.
- Click: `router.push('/artists')` AND `closeDropdown()`. Navigates to workspace landing.

### 5.5 Acceptance

**Smooth transition:**

- [ ] On `/artists/[A]`, click artist B in switcher → smooth cross-slide to tours pane WITHOUT dropdown closing. Dropdown stays open showing B's tours.
- [ ] After click, page has navigated to `/artists/[B]` (URL updated).
- [ ] Browser back → previous page restored. Dropdown should be closed (as it was before user clicked).
- [ ] Browser back/fwd does NOT cause dropdown to reopen unexpectedly (Sprint 7 Phase 1 sub-bug A regression check).

**Back-to-artists button:**

- [ ] Visible at top of artists pane.
- [ ] Click navigates to `/artists` workspace landing.
- [ ] Hidden in tours pane.
- [ ] Subtle styling — doesn't dominate the pane header.

- [ ] Lint + typecheck clean.

### 5.6 Quote in report

- Post-diagnosis sign-off timestamp.
- Post-fix implementation (popstate listener OR exitingPane gate, whichever was signed off).
- Back-to-artists button JSX.

### 5.7 Commit

`fix(shell-v2): smooth artist/tour pane transition + back-to-artists button (Phase 4 of Sprint 8)`

---

## 6. Phase 5 — Full ArtistCreateSlideOver + TourCreateSlideOver expansion

**Dual mockup sign-off required.** Post BOTH slide-over mockups in chat in one message.

### 6.1 Goal

Adam: "needs to be full artist builder, I think we should make sure the tour builder in the slide is also fully fledged, this can be our main way to add artists and tours instead of having multiple pages."

Both slide-overs become the canonical creation UX. Existing `<TourWizard>` (`src/components/tours/TourWizard.tsx`) stays mounted at its current route as a fallback for any deep-linked bookmarks, but the switcher's `+` buttons drive users to the slide-overs.

### 6.2 Existing flow audit (do this first, post in the mockup message)

Read `src/components/tours/TourWizard.tsx` end-to-end. List the fields it captures. The expanded `TourCreateSlideOver` should mirror that field set unless any field is decided to be "post-creation only" (e.g. routing, personnel assignments — those probably belong in a tour-edit flow, not creation).

For ArtistCreateSlideOver, there's no existing flow — list what fields the `artists` table requires (NOT NULL columns) and what optional fields are commonly populated. Reference `database/migrations/001_initial_schema.sql` for the artists table.

### 6.3 ArtistCreateSlideOver mockup (post for sign-off)

```
┌────────────────────────────────────────────────────────┐
│  NEW ARTIST                                       [×]  │
├────────────────────────────────────────────────────────┤
│                                                         │
│  NAME *                                                 │
│  [text input]                                           │
│                                                         │
│  LINK ON SPOTIFY                                        │
│  [search input — debounce-fetch /api/spotify/search] ⌕ │
│  ┌─ search results ──────────────────────────────────┐ │
│  │ [avatar] Artist Name · 1.2M followers · pop      │ │
│  │ [avatar] Artist Name · 800K followers · indie    │ │
│  └────────────────────────────────────────────────────┘ │
│  (or)                                                   │
│  ┌─ selected ─────────────────────────────────── [×] ┐ │
│  │ [avatar] Picked Artist                            │ │
│  │          1.2M followers · pop                     │ │
│  │          (banner + image will pull from Spotify)  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  GENRE  (optional, auto-fills from Spotify if linked)  │
│  [text input]                                           │
│                                                         │
├────────────────────────────────────────────────────────┤
│                              [Cancel]  [Create artist] │
└────────────────────────────────────────────────────────┘
```

**Spec:**

- Uses `<SlideOver>` primitive from `src/components/shell/SlideOver.tsx` (existing pattern).
- Width: `var(--lp-slide-over-width)` or 480px default.
- Fields:
  - **Name** (text, required). Default focus on open.
  - **Spotify link** (search + select). Debounce 300ms. Hits existing `/api/spotify/search?q=`. Display top 5 results. Click a result → fills `spotify_id`, `spotify_image_url`, `spotify_banner_url`. Shows selected card with `[×]` to clear.
  - **Genre** (text, optional). Pre-fills from Spotify result's `genres[0]` when linked.
- Validation: name required. Other fields optional. Submit disabled until name is non-empty.
- Submit: POST `/api/artists` with `{ name, spotify_id, spotify_image_url, spotify_banner_url, genre, branding: { primary_color: null, ... } }`. Returns the new artist row.
- On success: close slide-over, surface toast "Artist created", append new artist to wrapper's `artists` state via `onCreated` callback (mirror Phase 4's tour pattern), set new artist as `selectedArtistId`, navigate to `/artists/[new-id]`.

**Routing target on switcher:**

The switcher's `+` button in the artists pane (NEW — to be added in Phase 5 alongside the slide-over). Spec: at the bottom of the artists pane, mirror the `+ Create new tour` CTA at the bottom of the tours pane. Click → opens ArtistCreateSlideOver.

**API:** `POST /api/artists` may not exist yet. If it doesn't, write it. Mirror the existing `POST /api/tours` shape: auth-gate, RLS-scoped, INSERT artist row, return `{ id, name, ... }`. ~50 lines.

### 6.4 TourCreateSlideOver expansion mockup (post for sign-off)

```
┌────────────────────────────────────────────────────────┐
│  NEW TOUR                                          [×] │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ARTIST                                                 │
│  Good Neighbours    (auto from context, or)            │
│  [select picker if no artist in context]                │
│                                                         │
│  TOUR NAME *                                            │
│  [text input]                                           │
│                                                         │
│  START DATE *               END DATE *                  │
│  [date picker]              [date picker]               │
│                                                         │
│  CURRENCY                                               │
│  [select: GBP / USD / EUR / AUD]                        │
│                                                         │
│  CONTINENT                                              │
│  [select: UK / EU / US / AU / ASIA / SA / AF]          │
│                                                         │
│  PERSONNEL                                              │
│  Principal: [number]   Band: [number]   Crew: [number] │
│                                                         │
├────────────────────────────────────────────────────────┤
│                                [Cancel]  [Create tour] │
└────────────────────────────────────────────────────────┘
```

**Spec:**

- Same `<SlideOver>` primitive.
- Fields (mirror what TourWizard captures):
  - **Artist** — auto from `selectedArtistId` context if set; otherwise picker dropdown of workspace artists. Required.
  - **Tour name** (text, required).
  - **Start date** + **End date** (date inputs, both required, end_date must be ≥ start_date).
  - **Currency** (select, default workspace default — query the workspace's default currency if there's one).
  - **Continent** (select, default 'UK' or auto-detect if possible from start_date+location pickers — auto-detect deferred, just default UK).
  - **Personnel counts** (three number inputs, default 0): principal, band, crew.
- Validation: required fields enforced; end_date ≥ start_date; personnel counts ≥ 0.
- Submit: existing `POST /api/tours` (Sprint 5 used this; payload shape unchanged, just send the additional fields).
- On success: same as today — close, toast, optimistic prepend, navigate to product surface for the new tour.

**Existing TourCreateSlideOver lives at `src/components/shell-v2/TourCreateSlideOver.tsx`. Expand it; don't write a new file.**

### 6.5 Switcher `+` buttons

Two of them now:

- **`+ Create new tour`** at the bottom of tours pane (existing from Sprint 5).
- **`+ Create new artist`** at the bottom of artists pane (NEW). Same styling pattern.

Both wired to their respective slide-overs via the wrapper.

### 6.6 Acceptance

**ArtistCreateSlideOver:**

- [ ] `+ Create new artist` button visible at bottom of artists pane.
- [ ] Click → slide-over opens.
- [ ] Spotify search returns results. Click a result fills selected card.
- [ ] Submit creates artist, closes slide-over, toast appears, new artist appears in switcher's artists pane immediately, new artist is selected, page navigates to `/artists/[new-id]`.
- [ ] Empty name disables submit.

**TourCreateSlideOver expanded:**

- [ ] All fields render: artist (auto or picker), name, start/end dates, currency, continent, personnel counts.
- [ ] Validation: name + dates required; end ≥ start; counts ≥ 0.
- [ ] Submit creates tour with the full payload.
- [ ] On success: existing flow preserved (close + toast + optimistic prepend + navigation).

- [ ] Hex grep returns 0 in any new files.
- [ ] Lint + typecheck clean.

### 6.7 Quote in report

- Post-mockup sign-off timestamp(s).
- Field audit from TourWizard (what TourCreateSlideOver newly mirrors).
- ArtistCreateSlideOver file (full content).
- New `POST /api/artists` route if created.
- Expanded TourCreateSlideOver field block.
- Wrapper wiring for both `+` buttons.

### 6.8 Commit

`feat(shell-v2,api): full ArtistCreateSlideOver + TourCreateSlideOver expansion (Phase 5 of Sprint 8)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all five phases land.

1. Phase 1 — `/artists/[id]` hero banner reads as blurred, not pixelated. PASS / FAIL.
2. Phase 3 — `/artists/[id]` New Releases shows max 5 entries with album artwork. PASS / FAIL.
3. Phase 2 — Scroll past expanded TourHeader → compressed sticky bar smoothly fades in. Scroll back → reverses. No flicker. PASS / FAIL.
4. Phase 2 — `/advance/[tour]/page.tsx` (overview) renders TourHeader. AdvanceOverviewStatsStrip is GONE. PASS / FAIL.
5. Phase 4 — On `/artists/[A]`, click artist B in switcher → smooth cross-slide pane transition. Dropdown stays open showing B's tours. NO close-and-reopen. PASS / FAIL.
6. Phase 4 — Back-to-artists button visible at top of artists pane only. Click → navigates to `/artists`. PASS / FAIL.
7. Phase 4 — Browser back/fwd test (Sprint 7 regression check): open dropdown, navigate, back → dropdown stays closed. PASS / FAIL.
8. Phase 5 — `+ Create new artist` button at bottom of artists pane → opens slide-over → search Spotify → select → submit → artist created + appears in switcher + page navigates. PASS / FAIL.
9. Phase 5 — `+ Create new tour` button → expanded slide-over with all fields → submit → tour created with full payload. PASS / FAIL.
10. `prefers-reduced-motion: reduce` set in DevTools → all animations collapse to instant. PASS / FAIL.
11. Console clean on every page nav.
12. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

If 3, 5, 8 fail visually — pause and surface to Adam with screenshots.

---

## When done — report exactly this format

```
Sprint 8 done. Branch: feat/sprint-8-polish-builders
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(home): hero banner blur strength
- 2: <hash> feat(shell-v2): TourHeader scroll-collapse + AdvanceOverviewStatsStrip removal
- 3: <hash> feat(home): NewReleasesGrid 5-cap + artwork
- 4: <hash> fix(shell-v2): smooth pane transition + back-to-artists button
- 5: <hash> feat(shell-v2,api): full Artist/Tour Create slide-overs

Phase 2 mockup posted at <ts>, signed off at <ts>.
Phase 4 diagnosis posted at <ts>, signed off at <ts>.
Phase 5 ArtistCreateSlideOver mockup posted at <ts>, signed off at <ts>.
Phase 5 TourCreateSlideOver expansion mockup posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] hero banner blur line
[Phase 2] expanded → compressed transition implementation + AdvanceOverviewStatsStrip removal + TourHeader mount on overview
[Phase 3] API image_url projection + .slice(0, 5) + <img> render
[Phase 4] popstate listener (or exitingPane gate) + back-to-artists button JSX
[Phase 5] ArtistCreateSlideOver file + POST /api/artists route + expanded TourCreateSlideOver fields + + buttons wiring

V.1-12 results:
1. <pass/fail>
... (all 12)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Retire `<TourWizard>` entirely** — Adam wants slide-overs to replace pages. Keep TourWizard mounted at its current route as a fallback for now; retirement is a separate Sprint 9 item once the slide-overs prove out.
2. **Workspace-wide activity feed** — empty placeholder still on `/artists`. Needs `workspace_audit_log` schema + UNION query. Separate sprint.
3. **Edit profile slide-over** for `/artists/[id]` — Edit button still wires to legacy `/artists/[id]/edit` page.
4. **Logo upload UI** — fallback chain handles missing logos. Upload UI is its own sprint.
5. **Phase 4 Operations migration** — Personnel/Channel List/Payroll/Rooming/Files placeholder pages. TourHeader will eventually mount on those once they're real.
6. **Status pill 10s + page reload** — autosave UX, separate sprint.
7. **Custom field plus button broken** — chrome cleanup sprint.
8. **404 pages have no return-to-home button** — P3.
9. **Print button regression in read mode** — separate sprint.
10. **Five baseline `react-hooks/set-state-in-effect` errors in ArtistTourContext** — separate cleanup sprint.

If you find another bug while doing this sprint — note it in the report's "out of scope, deferred" section. Don't fix it.
