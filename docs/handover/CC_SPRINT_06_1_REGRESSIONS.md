# CC Sprint 6.1 — Regression fixes (Sprint 6 has critical blocker)

Sprint 6's PR (`fix/sprint-6-switcher-fixes`) has THREE regressions that block merge:

1. **CRITICAL** — Budget page client-side exception + flashing `<div hidden>` element. Reproducible only in Safari, not Chrome (per Adam's smoke).
2. Animations still flash (Sprint 6 Phase 1 didn't actually fix the open animation despite the RAF pattern claim).
3. Artist switch from `/artists/[id]` updates context but page content stays — Sprint 6's tour-click navigation fix only handles `/budget/*` `/advance/*` `/operations/*` paths, not `/artists/[id]`.

Plus one Adam-flagged visual miss: trigger still doesn't read as deliberate.

**Branch off `fix/sprint-6-switcher-fixes`** (NOT main — Sprint 6's other improvements are good and should be preserved). Four phases. Sprint 6 + 6.1 merge together as one PR.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_05_SWITCHER.md` and `docs/handover/CC_SPRINT_06_SWITCHER_FIXES.md` (context)
- `src/components/shell-v2/ArtistTourSwitcherClientWrapper.tsx` — the `useEffect` block at lines 105-145 (tours-fetch trigger). Most likely site of the render loop.
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — `openDropdown` at lines 264-282, `SwitcherPane` at lines 730-770, `handleArtistClick` and `handleTourClick`.
- `src/contexts/ArtistTourContext.tsx` — state-setter chains, in case the loop is upstream.
- `src/components/shell-v2/ProductHeader.tsx` — server fetches that re-run on every product nav.

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings. Hold the line.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Four commits in numeric order: 1 → 2 → 3 → 4. One per phase.
7. **Verify before claiming.** Quote post-fix file:line.
8. **No protocol skips.** Phase 1 requires diagnosis-and-halt — find the actual loop in a browser trace before fixing. Phase 3 requires a different animation strategy than Sprint 6's RAF pattern (which didn't work) and the new strategy needs sign-off before implementing.
9. **No work outside named files.** Out-of-scope list at the bottom.
10. **The user is currently blocked from using Budget.** This is the most urgent fix in the codebase right now. Phase 1 ships first, separately commitable, before Phase 2/3/4 even start. If you can't fix Phase 1 in <60 min, halt and surface — don't move on.

---

## 2. Phase 1 — Fix Budget white-screen + render loop (~60 min, blocker)

### 2.1 Symptom (Adam's verbatim)

> "wow! With the switcher open, I clicked budget and got this and a white screen with black text: Application error: a client-side exception has occurred while loading lowpass-tm-software-git-fix-sprint-0e2f07-adam-rowleys-projects.vercel.app (see the browser console for more information). Confirmed, navigating to budget reliably produces that screen and wont recover on 'back'"

DevTools Elements panel shows a `<div hidden></div>` element rapidly appearing and disappearing while on the budget page. That's a render loop signature — a component is mounting and unmounting in a tight cycle.

Reproducible in Safari only. Chrome doesn't show the white screen but the flashing element is observable in both.

### 2.2 Investigation step (post diagnosis to chat first — DO NOT skip)

Run the broken page locally so you can see the actual error AND the React re-render trace.

```bash
cd ~/Documents/lowpass-app
git checkout fix/sprint-6-switcher-fixes
git pull
npm run dev
```

Then:

1. Open `http://localhost:3000/budget/[any-real-tourId]?artist_id=[that-tour's-artist]` in Chrome.
2. DevTools → Console — capture every error message AND every "Maximum update depth exceeded" / "Too many re-renders" warning.
3. DevTools → Components (React DevTools) → enable "Highlight updates when components render." If the switcher / wrapper / context flickers orange constantly, that's the loop site.
4. DevTools → Sources → enable "Pause on uncaught exceptions." Reload the broken page. The debugger should pause at the throw site.

**Most likely candidates** (rank-ordered by my prior):

- **A. `ArtistTourSwitcherClientWrapper` tours-fetch effect.** The deps array includes `tours.length`. `fetchToursForArtist` calls `setTours([...])` which changes `tours.length`, retriggering the effect. The `if (selectedArtistId === toursArtistId) return;` guard SHOULD stabilize it, but if `queueMicrotask` ordering is wrong — e.g. tours is populated before toursArtistId is updated — the guard misses and the effect re-fires.
- **B. `ArtistTourContext` hydration writeback.** The `useLayoutEffect` from Sprint 4 writes back to localStorage when `nextTour !== lsTour`. If the writeback triggers another render that re-runs the effect with stale `urlSearchParams`, loop. The path-aware extract should be deterministic but it's worth confirming.
- **C. ProductHeader server fetch + client re-render.** Server fetches `initialArtists` and `initialTours` on every render. If those are passed as new array references each time and a child component compares by reference, you get a remount every nav.
- **D. Slide-over closed-state child.** `<div hidden>` could be the slide-over root rendering in closed state, and it's bouncing between mounted and unmounted.

**Post diagnosis to chat:**

```
Phase 1 diagnosis:
- Loop site: <which file:line, which state setter is firing>
- Root cause: <one sentence>
- Fix scope: <what specifically changes>
- Confidence: <high/medium/low — if low, ask Adam before fixing>
```

Wait for Adam's sign-off.

### 2.3 Fix (gated on diagnosis)

Sprint 6 introduced two effects that interact: the wrapper's tours-fetch and the optimistic-append. If the loop is in the wrapper, the fix is likely:

- Remove `tours.length` from the deps array — it's a derived value being used as a trigger.
- Use a ref pattern for tracking "do we need to refetch": `lastFetchedArtistIdRef.current`, compared in the effect.
- Drop `queueMicrotask` if it's reordering setState calls in a way React 19's automatic batching doesn't expect.

Or if the loop is in the context, the fix is to gate the localStorage writeback behind a "did this actually change" check that compares to a stable ref instead of the just-read localStorage value.

The fix is small once the cause is named. Don't refactor anything else.

### 2.4 Acceptance

- [ ] `/budget/[real-tourId]` direct loads cleanly. No white screen. No flashing `<div hidden>`. PASS / FAIL.
- [ ] Same in Safari (open in Safari to confirm the original repro is fixed). PASS / FAIL.
- [ ] Console clean — no "Maximum update depth" warnings, no React errors.
- [ ] React DevTools "Highlight updates" → switcher renders ≤2x on initial mount, not constantly.
- [ ] `/advance/[X]/[Y]?artist_id=Z` direct still loads cleanly (regression check — don't break working paths).
- [ ] Lint + typecheck clean.

### 2.5 Quote in report

- The post-fix block of whichever effect/setter chain was the loop site. Verbatim, ~15-30 lines.
- A before/after comparison of the deps array OR the state setter sequence.

### 2.6 Commit

`fix(shell-v2): break Budget render loop (Sprint 6.1 §1 — closes white-screen client exception)`

**Push this commit alone before starting Phase 2.** Adam can verify the critical bug is fixed on the preview before we layer more changes on.

---

## 3. Phase 2 — Artist-page navigation case (~30 min)

### 3.1 Symptom (Adam's smoke)

On `/artists/[A]/...`, opening the switcher and selecting artist B + tour T → trigger updates to "B · T" but the page still shows artist A's content.

### 3.2 Root cause

`handleTourClick` in Sprint 6 only calls `router.push` for `/budget/*` `/advance/*` `/operations/*` paths. On `/artists/[A]/...`, productMatch is null → no navigation → URL stays at `/artists/[A]` → page renders artist A.

`handleArtistClick` doesn't navigate at all — it transitions the dropdown to tours pane. So if user just switches artist (without a tour pick), URL stays at `/artists/[A]`.

### 3.3 Fix

Update `handleArtistClick` and `handleTourClick` in `ArtistTourSwitcher.tsx`:

```ts
const handleArtistClick = useCallback(
  (id: string) => {
    setSelectedArtistId(id);
    transitionToPane('tours', 'forward');
    // Sprint 6.1 §2 — when on /artists/[X]/..., navigate to the
    // new artist's home page so the page content reflects context.
    if (pathname?.startsWith('/artists/')) {
      router.push(`/artists/${id}`);
    }
  },
  [setSelectedArtistId, transitionToPane, pathname, router],
);

const handleTourClick = useCallback(
  (id: string) => {
    setSelectedTourId(id);
    closeDropdown();
    const productMatch = pathname?.match(/^\/(budget|advance|operations)\//);
    if (productMatch) {
      router.push(`/${productMatch[1]}/${id}`);
      return;
    }
    // Sprint 6.1 §2 — on /artists/[X]/..., picking a tour also navigates
    // to that tour's default surface. Send to /budget/[id] as a default —
    // it's the most-used product. User can re-rail from there.
    if (pathname?.startsWith('/artists/')) {
      router.push(`/budget/${id}`);
    }
  },
  [setSelectedTourId, closeDropdown, pathname, router],
);
```

The default-to-budget choice for tour-from-artist-home is a UX call. If Adam wants a different default (e.g. /advance/[id], or stay on /artists/[id] and update tour context only), he'll flag it on smoke. The current behavior is functionally broken so this is a strict improvement.

### 3.4 Acceptance

- [ ] On `/artists/[A]/...`, click artist B in switcher → URL changes to `/artists/[B]`, page renders artist B's content.
- [ ] On `/artists/[A]/...`, click a tour (any artist) → URL changes to `/budget/[tourId]`, budget page loads.
- [ ] On `/budget/[A-tour]`, click a tour from another artist → URL becomes `/budget/[new-tour]`. Same product preserved. (Regression check.)
- [ ] On `/personnel` or other non-product non-artist page, tour click → URL doesn't change, context updates only. (Regression check.)
- [ ] Lint + typecheck clean.

### 3.5 Quote in report

- Post-fix `handleArtistClick` body.
- Post-fix `handleTourClick` body.

### 3.6 Commit

`fix(shell-v2): switcher navigates from /artists/[id] paths (Sprint 6.1 §2)`

---

## 4. Phase 3 — Animations actually animate (~60 min, requires new approach)

### 4.1 Symptom

Sprint 6's RAF pattern was supposed to fix the open-flash and pane-jump. **It didn't.** Adam's smoke confirms both still flash.

### 4.2 Why RAF didn't work

Most likely: React 19's automatic batching. `setDropdownState('opening')` and the RAF-scheduled `setDropdownState('open')` may end up batched into a single render cycle by React's compiler, so the browser never gets a paint frame with the "before" state. RAF schedules its callback before the next browser paint, but if React processes the state update synchronously into the next render, the browser only paints once with the final state.

The fix is to escape React's render lifecycle for the animation entirely. Options:

- **A.** Use `WebAnimations.animate()` directly via a ref. Component renders once, then on `dropdownState` change a `useEffect` calls `panelRef.current.animate([{opacity: 0, transform: 'translateY(-4px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 200, easing: '...'})`. The animation runs in the browser's compositor, completely outside React.
- **B.** Use a CSS class toggle with a `setTimeout(..., 0)` instead of RAF. setTimeout schedules a macrotask that React's batching can't absorb. Less elegant than A but smaller diff.
- **C.** Use a one-frame `useState` setter inside `useLayoutEffect` with `flushSync` to force a synchronous paint between mount and animate. More React-idiomatic but more complex.

### 4.3 Diagnosis-and-halt step

Pick one option. Post to chat:

```
Phase 3 strategy:
- Picked: <A / B / C>
- Why: <one sentence on the trade-off>
- Code shape: <one paragraph showing what changes in ArtistTourSwitcher.tsx>
```

Wait for Adam's sign-off, then implement.

**My recommendation (default if Adam doesn't pick): Option A.** Web Animations API is purpose-built for this case — independent of React's render cycle, runs on the GPU, has built-in support for cancel/reverse/finish callbacks. The `useAnimation` hook from React doesn't exist natively but the manual `useRef + useEffect + element.animate(...)` pattern is well-established.

### 4.4 Implementation (Option A sketch)

```ts
const panelRef = useRef<HTMLDivElement | null>(null);
const animationRef = useRef<Animation | null>(null);

useEffect(() => {
  const el = panelRef.current;
  if (!el) return;
  // Cancel any in-flight animation before starting a new one.
  animationRef.current?.cancel();
  if (dropdownState === 'open') {
    animationRef.current = el.animate(
      [
        { opacity: 0, transform: 'translateY(-4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      {
        duration: 200,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // verify the exact easing-decelerate token equivalent
        fill: 'forwards',
      },
    );
  } else if (dropdownState === 'closing') {
    animationRef.current = el.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-4px)' },
      ],
      { duration: 150, easing: '...', fill: 'forwards' },
    );
    animationRef.current.onfinish = () => setDropdownState('closed');
  }
}, [dropdownState]);
```

Same approach for the SwitcherPane's enter/exit animations — animate via ref, not via class-toggle + CSS transition.

### 4.5 Drop the `'opening'` intermediate state

It was added in Sprint 6 to support the two-frame RAF pattern. Web Animations API doesn't need it — the animation runs from `from` keyframe to `to` keyframe regardless of React state. Cleaner state machine: `closed | open | closing`.

### 4.6 CSS cleanup

Remove the `[data-state='open']` / `[data-state='closing']` style rules and the `[data-pane-state='enter-from-...']` rules from `globals.css`. Keep only the base `.lp-ats-panel` (flexbox / sizing / borders / box-shadow) and `.lp-ats-pane` (positioning / overflow). Animations live in JS now.

Keep the `prefers-reduced-motion` block — but adapt it: Web Animations respects `prefers-reduced-motion` automatically for `.animate()` if you also pass an `AnimationEffectTimingProperties` with `duration: 0` when the user has the preference set. Or you can check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` in the effect and skip the animation entirely.

### 4.7 Acceptance

- [ ] Open dropdown → smooth opacity + translateY animation, visible to the eye, no flash. PASS / FAIL.
- [ ] Close dropdown → reverse animation, smooth. PASS / FAIL.
- [ ] Click artist → pane cross-slide smooth, no jump. PASS / FAIL.
- [ ] Click back → reverse pane animation smooth. PASS / FAIL.
- [ ] `prefers-reduced-motion: reduce` → animations resolve to ≤50ms or instant, depending on chosen approach. PASS / FAIL.
- [ ] No "Maximum update depth" warnings in console.
- [ ] Lint + typecheck clean.

### 4.8 Quote in report

- The post-fix `useEffect` that calls `element.animate()` for the panel.
- Same for `SwitcherPane`.
- The deleted CSS lines from globals.css (just confirm they're gone — quote the line numbers that no longer exist OR a `git diff` summary).

### 4.9 Commit

`fix(shell-v2): switcher animations via Web Animations API (Sprint 6.1 §3 — escapes React batching)`

---

## 5. Phase 4 — Trigger visual redesign (~45 min)

### 5.1 Spec from Adam

- **Layout: Option B** — two-row, artist name top + tour name bottom, avatar to the left.
- **Avatar: 40-48px** (left side).
- **Prominence: Primary feel.** No orange background. Optionally a 2px orange left-border accent when the dropdown is open / when active.
- **"REALLY obvious"** — Adam wants to always know which artist he's working with. The avatar carries the artist branding; make it feel like a profile chip.

### 5.2 Design

```
┌──────────────────────────────────────┐
│ [40px AVATAR] Artist Name        ⌄  │
│               Tour Name              │
└──────────────────────────────────────┘
   ↑ optional 2px orange left-border when open
```

Specifics:
- Trigger height: ~56-60px (taller than current 36).
- Padding: `var(--lp-space-2)` vertical, `var(--lp-space-3)` horizontal.
- Avatar: 40px circle, left side, `var(--lp-space-3)` gap to the text block.
- Artist name row: 15px, font-medium, `var(--lp-text)`.
- Tour name row: 13px, font-regular, `var(--lp-text-secondary)`.
- Trailing chevron: 14px, `var(--lp-text-tertiary)`.
- Background: `var(--lp-panel)` at rest. Hover: `var(--lp-panel-hover)`.
- Open / active state: 2px left-border in `var(--color-lp-orange)`. The rest of the border continues to be `1px var(--lp-border)`.
- Border-radius: `var(--lp-radius-md)` or whatever matches the rest of the ProductHeader buttons.
- Empty state — no artist: avatar slot is the dashed-circle User placeholder (existing), single row "Pick an artist…" centered vertically, tertiary text.
- Empty state — artist but no tour: avatar + "Artist Name" on top, "Pick a tour…" tertiary text on bottom.

### 5.3 Acceptance

- [ ] Trigger renders ≥56px tall with 40px avatar.
- [ ] Two-row layout: artist name above, tour name below (or empty-state variants).
- [ ] Hover state visible. Open state shows 2px orange left-border.
- [ ] No raw hex introduced. Run grep again: `grep -n "#[0-9a-fA-F]\{3,8\}" src/components/shell-v2/ArtistTourSwitcher.tsx` returns 0.
- [ ] Visual reads as deliberate / "really obvious" — Adam's eyeball test on Vercel preview.
- [ ] Doesn't break the ProductHeader layout on narrower viewports — wrap or truncate gracefully.
- [ ] Lint + typecheck clean.

### 5.4 Quote in report

- Post-fix trigger button JSX.
- Post-fix trigger button styles (token references inline or in CSS class).
- The hex grep result.

### 5.5 Commit

`fix(shell-v2): switcher trigger two-row visual upgrade (Sprint 6.1 §4)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all four phases land.

1. `/budget/[real-tourId]` direct → loads cleanly, no white screen, no flashing element. Safari + Chrome both. PASS / FAIL.
2. Open switcher dropdown → smooth roll-in animation (NOT flash). PASS / FAIL.
3. Click artist in switcher → pane cross-slide smoothly. PASS / FAIL.
4. On `/artists/[A]`, click artist B → URL changes to `/artists/[B]`, page renders artist B. PASS / FAIL.
5. On `/artists/[A]`, click a tour T → URL changes to `/budget/[T]`, budget page loads. PASS / FAIL.
6. On `/budget/[old]`, click a different tour → URL becomes `/budget/[new]` (existing Sprint 6 behavior preserved). PASS / FAIL.
7. Click "+ Create new tour" → slide-over opens, submit creates tour, new tour appears in switcher list (Sprint 6 behavior preserved). PASS / FAIL.
8. Trigger button: 56-60px tall, 40px avatar, two-row text layout, looks deliberate. PASS / FAIL.
9. Open state shows 2px orange left-border accent. PASS / FAIL.
10. `prefers-reduced-motion: reduce` → animations collapse to instant or near-instant. PASS / FAIL.
11. Console clean on every page nav — no "Maximum update depth" warnings.
12. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

---

## When done — report exactly this format

```
Sprint 6.1 done. Branch: fix/sprint-6.1-regressions (off Sprint 6 branch)
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2): break Budget render loop
- 2: <hash> fix(shell-v2): switcher navigates from /artists/[id]
- 3: <hash> fix(shell-v2): switcher animations via Web Animations API
- 4: <hash> fix(shell-v2): switcher trigger two-row visual upgrade

Phase 1 diagnosis posted at <ts>, signed off at <ts>.
Phase 3 strategy posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] loop site + fix
[Phase 2] handleArtistClick + handleTourClick
[Phase 3] panel animate() effect + pane animate() effect + CSS deletions
[Phase 4] trigger JSX + styles + hex grep result

V.1-12 results:
1. <pass/fail>
... (all 12)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Workspace `/artists` page on old design** — Sprint 7 target.
2. **`/artists/[id]` artist detail page redesign** — Sprint 7 target.
3. **Default-to-budget on tour-from-artist-home click** — UX call. Phase 2 picks `/budget/[id]` as default; if Adam wants different (e.g. `/advance/[id]`), separate one-line tweak.
4. **TourWizard currency cleanup** — separate sprint.
5. **POST /api/tours response shape consistency** — separate sprint.
6. **ProductHeader pre-fetch on every nav** — Sprint 5 sign-off accepted; perf optimization deferred.
7. **Five baseline lint errors in ArtistTourContext** — separate cleanup sprint.
8. **Status pill 10s + page reload** — separate sprint.
9. **Custom field plus button broken** — chrome cleanup sprint.

If you find another bug or improvement opportunity while doing this sprint — note it in the report's "out of scope, deferred" section. Don't fix it.
