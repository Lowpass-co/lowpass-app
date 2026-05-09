# CC Sprint 6 — Switcher fixes (functional + visual)

Sprint 5 (`feat/sprint-5-switcher`) shipped the structural switcher correctly — static analysis is clean (no raw hex, tokens added, file sizes reasonable). But Adam's runtime smoke surfaced four real bugs:

1. Animations don't actually animate — open is a flash, close is a fade, pane transitions jump.
2. Tour click doesn't navigate / update the page.
3. When switching artist, the tour list shows the OLD artist's tours for ~1s before swapping.
4. After creating a new tour via the slide-over, the new tour doesn't appear in the switcher list.

Plus two minor:

5. Tour list within a year is sorted by created date instead of `start_date desc`.
6. Switcher trigger visual feels small and accidental. Adam: "looks like a social media profile" — wants the trigger to carry the artist avatar and read as deliberate.

**Branch off `main`** (which has Sprint 5 merged). Three commits + verify (1 → 2 → 3 → V). ~3-4 hr CC time.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_STATE_2026_05_03.md`
- `docs/handover/CC_SPRINT_05_SWITCHER.md` — the Sprint 5 prompt (for context on intent)
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — 1077 lines. The component is on `main` now. Read carefully.
- `src/components/shell-v2/ArtistTourSwitcherClientWrapper.tsx` — 54 lines, the bridge between server and client.
- `src/components/shell-v2/TourCreateSlideOver.tsx` — 404 lines. The submit flow at the bottom is where Bug 4 lives.
- `src/components/shell-v2/ProductHeader.tsx` — server-side fetches that pass `initialArtists` and `initialTours` to the wrapper. Bug 3 likely involves this.
- `src/app/globals.css` lines 444-528 — the animation CSS Sprint 5 added. Bug 1 lives here.

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Three commits in order: 1 → 2 → 3.
7. Verify before claiming. Quote post-fix file:line in the report.
8. **Bug 1 is the visual win.** The animation rules from Sprint 5 (Hard Rule 9) apply unchanged — smooth, no jumpy janky shit, `prefers-reduced-motion` honored. If after this sprint the dropdown still flashes/jumps on Adam's smoke, the sprint failed.
9. **No protocol skips.** If the diagnosis surfaces something the prompt doesn't cover, post and wait for sign-off.
10. **No work outside named files.** Out-of-scope list at the bottom — leave them alone.

---

## 2. Phase 1 — Fix animations (~75 min)

### 2.1 Symptom (Adam's verbatim smoke)

- Open: "flash" (no animation, panel just appears).
- Close: "fade" (this part works).
- Pane transitions: "jumps both ways" (no slide between artist list and tour list).

### 2.2 Investigation step (post diagnosis to chat first)

Read `globals.css:444-528` and the relevant CSS class application sites in `ArtistTourSwitcher.tsx`. Specifically identify:

1. The CSS rule that should animate the panel open. What property is being transitioned (opacity, transform, both)? What's the duration?
2. The CSS rule that animates pane transitions. Are both panes mounted simultaneously during the transition (cross-fade) or is one swapping in via display toggle? Display toggles can't animate — that's the most common cause of flash-vs-roll mismatch.
3. The state setter sequence: when the dropdown opens, in what order are `dropdownState`, `pane`, and `exitingPane` set? If they're all set in the same tick, React batches and the browser never gets a frame with the "before" state — so no transition fires.
4. Is the `data-state` attribute being toggled in a way the CSS can react to? Sometimes the open animation needs an initial "closed" frame painted before the "open" attribute lands; that's what `requestAnimationFrame` or two-step state setting is for.

Post a one-paragraph diagnosis to chat:

```
Phase 1 diagnosis:
- Open animation: <state of CSS + JS, what property is transitioning, why it's flashing>
- Pane transition: <whether both panes mount, why it jumps>
- Fix scope: <what specifically you'll change>
```

Wait for Adam's sign-off, then fix.

### 2.3 Fix scope

Likely fixes (subject to diagnosis):

- **Open animation is a flash** — probably needs a two-frame state pattern: render the panel hidden first (with `data-state="closed"` or similar), then on next animation frame set it to open so the CSS transition has a "before" state to interpolate from. Or: the CSS uses `transform: translateY(-4px)` for the closed state but also has `display: none` which prevents the element from existing during the transition. Switch to opacity + pointer-events for hidden state.
- **Pane transition jumps** — most likely both panes need to be absolutely-positioned siblings inside a `position: relative` container. The exiting pane gets `transform: translateX(-8px); opacity: 0` over 250ms; the entering pane gets `transform: translateX(0); opacity: 1` over 250ms; both happen simultaneously. If currently they're stacked block-flow, one disappears and the other appears with zero overlap → jump.

The "roll" Adam wants probably means: panel translates IN from above (transform: translateY(-8px) → 0 with opacity 0 → 1) on open, and reverse on close. That's the conventional dropdown-roll animation.

### 2.4 Acceptance

- [ ] Open: dropdown rolls in from above (opacity + translateY) over `--lp-duration-base` (or whatever the relevant token is — verify in globals.css). No flash. Visible transition with the human eye.
- [ ] Close: same animation in reverse. Smooth, no jump.
- [ ] Artist click → pane swap: the two panes cross-fade with horizontal slide (artists pane slides 8px left + fades out, tours pane slides in 8px from right + fades in). Both animations happen simultaneously over `--lp-duration-slower` (or 250ms target).
- [ ] Back chevron → reverse direction, same smoothness.
- [ ] `@media (prefers-reduced-motion: reduce)` collapses to opacity-only with ≤50ms duration (existing behavior, keep it).
- [ ] Lint + typecheck clean.

### 2.5 Quote in report

- The post-fix CSS for the panel open/close (verbatim).
- The post-fix CSS for the pane transitions (verbatim).
- Any JS state-setter changes (e.g. requestAnimationFrame or useLayoutEffect to sequence the state correctly).

### 2.6 Commit

`fix(shell-v2): switcher animations now actually animate (open roll + pane cross-slide)`

---

## 3. Phase 2 — Fix data freshness + sort (~75 min)

Three sub-bugs, one commit. Fix all together.

### 3.1 Sub-bug A: Tour click doesn't navigate

**Symptom:** Adam clicks a tour in the switcher list, dropdown closes, but the page doesn't change.

**Hypothesis:** The tour click handler calls `setSelectedTourId(tourId)` from the context (which writes to URL via `syncUrlParams`), but `syncUrlParams` only updates the query string — it doesn't navigate to a new path. The user is on `/budget/[old-tour]` and selecting a new tour writes `?tour_id=new-tour` to the URL, but the path segment is still the old tour, so the page renders the old tour.

**Fix:** When clicking a tour in the switcher, the handler needs to navigate to the tour-scoped URL for the current product. Logic:

```ts
function handleTourClick(tourId: string) {
  setSelectedTourId(tourId);
  // Determine the active product from the current pathname:
  //   /budget/* → /budget/[newTourId]
  //   /advance/* → /advance/[newTourId]
  //   /operations/* → /operations/[newTourId]
  //   /artists/[id] → stay on artist home but update tour selection (already done by setter)
  //   /* (anything else, e.g. /personnel) → stay put, just update context
  const pathname = window.location.pathname;
  const productMatch = pathname.match(/^\/(budget|advance|operations)\//);
  if (productMatch) {
    router.push(`/${productMatch[1]}/${tourId}`);
  }
  closeDropdown();
}
```

Use `useRouter` from `next/navigation`. Don't preserve `?artist_id` — `setSelectedTourId` already handles URL params via context.

### 3.2 Sub-bug B: Stale tours visible during artist switch

**Symptom:** When Adam clicks a different artist in the switcher, the tour list shows the OLD artist's tours for ~1s before swapping.

**Hypothesis:** `initialTours` is the only source for the tours render. When user clicks artist B, `setSelectedArtistId(B)` fires, but `initialTours` is still the server-fetched list for artist A. The fetch for artist B's tours either doesn't fire or takes a moment, so the OLD list stays rendered until something replaces it.

**Fix:** When the user clicks an artist in the switcher (transitioning to the tours pane), immediately:
1. Clear the tours list locally to an empty array (or to a loading state).
2. Fetch artist B's tours via a client-side request to a new or existing endpoint:
   - Check whether `/api/artists/[id]/tours` exists. If yes, use it.
   - If not: the existing `getHomeData()` server helper (`src/server/home/getHomeData.ts`) likely has the right query — but that's server-only. You'd need a `/api/artists/[id]/tours` route. Investigate first.
3. While fetching, render a small loading state (skeleton rows or "Loading…") in the tours pane.
4. When fetch completes, render the new list.

**Investigation step:** Read `src/server/home/getHomeData.ts` and any existing `/api/artists` routes to find the tours-by-artist query pattern. If no client-callable endpoint exists, write one as part of this phase. The route handler is small (~20 lines) — `GET /api/artists/[id]/tours` returning the tours for that artist with the same select shape (`id, name, start_date, end_date`) as the server-side initial fetch.

### 3.3 Sub-bug C: New tour doesn't appear in switcher after creation

**Symptom:** After submitting the create-tour form, the slide-over closes and a toast shows, but the switcher's tour list doesn't include the new tour.

**Hypothesis:** Sprint 5's flow: on submit success, calls `setSelectedTourId(newTourId)` and `router.refresh()`. The `router.refresh()` re-runs the server component (`ProductHeader`) which re-fetches `initialTours` — that should include the new tour. But:
- Maybe `router.refresh()` isn't actually happening.
- Or it IS happening but the client component (`ArtistTourSwitcher`) caches the `initialTours` prop and doesn't re-render with new data.
- Or the server-side fetch doesn't see the new row yet (write hasn't replicated — unlikely on Supabase but possible).

**Fix options:**
- **A.** Optimistic update: in the slide-over's submit handler success path, call a callback prop on the wrapper that appends the new tour to local state. The switcher reads from local state instead of (or in addition to) `initialTours`.
- **B.** Force a `router.refresh()` AND wait for the new server-rendered data via a `useEffect` on `initialTours` prop changes that re-syncs local state.

**Recommended: A.** It's faster (no round trip), simpler, and avoids React 19 server-component refresh edge cases. The optimistic append uses the response from the POST (which already returns the inserted row) so we know exactly what to append.

### 3.4 Sub-bug D: Tour sort within year

**Symptom (Adam's smoke):** "5 - PASS though should be sorted DATE first, not created first."

**Hypothesis:** Tours within each year group are sorted by `created_at` (default DB order) instead of `start_date desc`.

**Fix:** In the `groupToursByYear` helper (or wherever year grouping happens), sort tours by `start_date desc` before grouping. If `start_date` is null, push to the bottom of the year group (or the dedicated "UNDATED" group, whichever Sprint 5 defined).

### 3.5 Acceptance

- [ ] Click a tour in the switcher → URL updates AND page navigates to the tour-scoped URL for the current product (e.g. `/budget/[newTour]` if user was on `/budget/[oldTour]`).
- [ ] Click a tour while on a non-product page (e.g. `/personnel`) → context updates, dropdown closes, no navigation.
- [ ] Click a different artist → tours pane shows loading state immediately, then renders the new artist's tours when fetch completes.
- [ ] Create a new tour via the slide-over → on success, the new tour appears in the switcher's tour list immediately (without a manual refresh). New tour is selected.
- [ ] Tours within each year group sorted by `start_date desc` (most recent first). Tours with null `start_date` at the bottom of their year group OR in the UNDATED group (whichever Sprint 5 defined — preserve that).
- [ ] Lint + typecheck clean.

### 3.6 Quote in report

- Post-fix `handleTourClick` body.
- New `/api/artists/[id]/tours` route file (full content if created, or "existing route reused at <path>" with the source path quoted).
- Post-fix tours-pane data flow showing the loading-state + fetch chain.
- Post-fix optimistic append in the slide-over success handler.
- Post-fix sort comparator in `groupToursByYear`.

### 3.7 Commit

`fix(shell-v2): switcher data freshness — navigation on click, stale tour clear, optimistic create append, start_date sort`

---

## 4. Phase 3 — Switcher trigger visual upgrade (~45 min)

### 4.1 Symptom (Adam's verbatim)

> "kind of? It's a bit small honestly, and looks almost accidental."

Adam wants the trigger to feel deliberate and carry the artist's visual identity (avatar/branding). Right now it's text-only with a chevron — minimal but reads as forgettable.

### 4.2 Design (Adam's spec carried forward)

The trigger button should:

1. **Show the artist avatar** (24-28px circle). Use the existing `pickArtistImageUrl()` equivalent from Sprint 5's inline implementation. If no image, fall back to the initials chip (orange bg + white initials) — same as the artists pane uses.
2. **Be larger and more deliberate** — bump the trigger height from whatever it currently is to ~36-40px. Padding `--lp-space-3` horizontal, `--lp-space-2` vertical. Token-only.
3. **Layout left to right**: avatar (24-28px circle) → 8px gap → artist name (font-medium, 14px, `var(--lp-text)`) → bullet separator (`var(--lp-text-secondary)`) → tour name (regular, 14px, `var(--lp-text-secondary)`) → 8px gap → chevron (12px, `var(--lp-text-tertiary)`).
4. **Hover state**: background → `var(--lp-panel-hover)` (the token Sprint 5 added).
5. **Active state (dropdown open)**: subtle 1px border in `var(--lp-border-strong)` + slight tinted background.
6. **Empty states**:
   - No artist: just a "Pick an artist…" pill with a placeholder avatar (use a generic person icon from lucide-react: `User` or `Users`, 16px, in `var(--lp-text-tertiary)` inside the avatar slot).
   - Artist but no tour: avatar + artist name + "·" + "Pick a tour…" in tertiary text.

### 4.3 Acceptance

- [ ] Trigger renders with artist avatar (image OR initials chip) when artist is selected.
- [ ] Trigger height ≥36px. Padding token-only.
- [ ] Hover state visible. Active state (open) visually distinct.
- [ ] Empty states render with placeholder avatar.
- [ ] Visual weight reads as deliberate — Adam's eyeball test on Vercel preview.
- [ ] Lint + typecheck clean.
- [ ] No raw hex introduced. Run the grep again before reporting done: `grep -n "#[0-9a-fA-F]\{3,8\}" src/components/shell-v2/ArtistTourSwitcher.tsx` should still return zero.

### 4.4 Quote in report

- The post-fix trigger button JSX (just the trigger render, ~20-30 lines).
- The trigger CSS class (or inline styles using tokens).
- The empty-state JSX for both no-artist and no-tour cases.

### 4.5 Commit

`fix(shell-v2): switcher trigger visual upgrade — artist avatar + larger deliberate styling`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview.

1. Open dropdown — rolls in from above with smooth opacity + translateY. No flash. PASS / FAIL.
2. Close dropdown — rolls out smoothly. PASS / FAIL.
3. Click an artist (when open in artists pane) — pane cross-slides smoothly, no jump. PASS / FAIL.
4. Click back chevron — reverse direction, same smoothness. PASS / FAIL.
5. Click a tour from the switcher while on `/budget/[old]` — URL changes to `/budget/[new]`, page navigates. PASS / FAIL.
6. Click a different artist in the artists pane — tours pane shows loading state immediately, then the new artist's tours. NO stale tours from previous artist. PASS / FAIL.
7. Create a new tour via the slide-over — new tour appears in the switcher's tour list immediately after the slide-over closes. New tour is selected. PASS / FAIL.
8. Tour list within a year is sorted by `start_date desc`. Most recent tour at the top. PASS / FAIL.
9. Trigger button in ProductHeader carries the artist avatar. Visual weight reads as deliberate, not accidental. PASS / FAIL.
10. `prefers-reduced-motion: reduce` set in DevTools → animations resolve to short fades. PASS / FAIL.
11. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

---

## When done — report exactly this format

```
Sprint 6 done. Branch: fix/sprint-6-switcher-fixes
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2): switcher animations now actually animate
- 2: <hash> fix(shell-v2): switcher data freshness
- 3: <hash> fix(shell-v2): switcher trigger visual upgrade

Phase 1 diagnosis posted to chat at <timestamp>, signed off by Adam at <timestamp>.

Quoted post-fix lines:
[Phase 1] panel open/close CSS
          pane transition CSS
          state-setter sequencing
[Phase 2] handleTourClick body
          /api/artists/[id]/tours (new or reused)
          stale-clear + fetch chain
          optimistic append in slide-over
          start_date sort comparator
[Phase 3] trigger button JSX + CSS
          empty-state variants
          hex grep result (should be 0)

V.1-11 results:
1. <pass/fail>
... (all 11)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Workspace `/artists` page is on the old design** (top nav with Dashboard / Personnel / Calendar / Equipment). Adam flagged it but it's a Sprint 7 (artist surfaces redesign) target. Do not modernize this page in this sprint.
2. **`/artists/[id]` artist detail page** — name + icon "small and accidental." Sprint 7 target. Do not redesign in this sprint.
3. **Status pill 10s + page reload** (smoke test 30 from earlier) — separate sprint.
4. **Phase 4 Operations migration** (Personnel / Templates / Venues page rebuilds).
5. **TourWizard currency cleanup** (still has inline currency-symbol formatting beyond `CURRENCIES` import — Sprint 5 noted it).
6. **POST /api/tours response shape consistency** (returns raw row instead of `{ tour: data }` — Sprint 5 noted it).
7. **Custom field plus button broken** — chrome cleanup sprint.
8. **404 pages have no return-to-home button** — P3.

If you find another bug or improvement opportunity while doing this sprint — note it in the report's "out of scope, deferred" section. Don't fix it.
