# CC Sprint 6.2 — Sprint 6.1 regressions (four targeted fixes)

Sprint 6.1's PR survives most of its goals (Budget loads, white-screen gone, /artists/[X] navigation works, console clean) but four user-visible bugs remain after Adam's preview smoke. Plus one carry-over from Sprint 6 that resurfaced.

This sprint corrects them on a branch off `fix/sprint-6.1-regressions` so all of Sprint 5 + 6 + 6.1 + 6.2 ship together as one final stack.

**Branch off `fix/sprint-6.1-regressions`** (the in-flight Sprint 6.1 PR). Four phases, four commits, V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_06_SWITCHER_FIXES.md` and `docs/handover/CC_SPRINT_06_1_REGRESSIONS.md` (context)
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — `handleTourClick` (~line 425), pane animation effect (~line 797), trigger button JSX (~line 475-625)
- `src/components/shell-v2/ArtistTourSwitcherClientWrapper.tsx` — tours state + `handleTourCreated` (~line 147), parent of the SwitcherPane components
- `src/contexts/ArtistTourContext.tsx` — `setSelectedTourId` writes URL via `syncUrlParams`

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Four commits in order: 1 → 2 → 3 → 4. One per phase.
7. Verify before claiming. Quote post-fix file:line.
8. **Phases 1, 2, and 4 require diagnosis-and-halt.** Each has a hypothesis in the prompt but Adam wants the cause confirmed before the fix lands. Phase 3 is mechanical (visual respec) — no diagnosis needed.
9. **No protocol skips.** Sprint 6.1 Phase 1 over-claimed first time around. The diagnosis-and-halt for the second iteration found the actual bug. Same standard here.
10. Out-of-scope list at the bottom — don't touch.

---

## 2. Phase 1 — Tour click on /budget doesn't update trigger label (~45 min)

### 2.1 Symptom (Adam's verbatim)

> "URL changes, but the tab label stays the same no matter how many times I change it"

The switcher trigger's "Artist · Tour" display continues showing the OLD tour name after clicking a different tour. URL DOES update (so `router.push` is firing). Page content may or may not be updating — Adam didn't specify. The visible bug is the trigger label.

### 2.2 Hypothesis (confirm or refute in diagnosis post)

`handleTourClick` at `ArtistTourSwitcher.tsx:425` calls `setSelectedTourId(id)` synchronously BEFORE `router.push`. `setSelectedTourId` from context calls `syncUrlParams(currentArtist, id)` which does `router.replace('/budget/[old-tour]?tour_id=[new]&artist_id=[X]')` — keeping the OLD path segment but adding NEW tour_id as query.

Then `router.push(\`/${productMatch[1]}/${id}\`)` fires. Two router calls in succession:

```
router.replace('/budget/[OLD]?tour_id=[NEW]&artist_id=[X]')
router.push('/budget/[NEW]')
```

This double-write confuses Next's router. Possible outcomes:
- The push wins, URL becomes `/budget/[NEW]` (no query). Hydration runs with path=NEW, urlTourId=null, sets state to NEW. Trigger should update.
- The replace lingers in router state, URL transitions through `/budget/[OLD]?tour_id=[NEW]` first, then `/budget/[NEW]`. During the transition, `useSearchParams` and `usePathname` may yield mismatched values, leading to hydration that resolves to old state.
- Next 16 batches the two writes and only commits one — depends on which.

Either way, the redundant `setSelectedTourId` call before navigation is wrong. The path-aware hydration on the new URL should set context state correctly without help.

### 2.3 Investigation step (post diagnosis to chat first)

1. Open the broken Vercel preview in Chrome.
2. DevTools → Console. Run this in console BEFORE clicking a tour:
   ```js
   localStorage.setItem('debug-router', '1');
   ```
3. Patch the running code temporarily (or just read the source) to understand whether after `router.push`, the trigger DOES re-read context and pick up the new tour eventually, or whether context never updates.
4. Add a one-time `console.log('selectedTourId in trigger render:', selectedTourId)` near the trigger render to capture the value across the click.
5. Click a tour. Observe the logs and URL transitions.

Post diagnosis:

```
Phase 1 diagnosis:
- URL transitions: <e.g., /budget/[A] → /budget/[A]?tour_id=B → /budget/[B]>
- selectedTourId in context after click: <value, and how soon it updates>
- Why trigger doesn't reflect new tour: <one sentence>
- Fix scope: <what changes>
```

Wait for Adam's sign-off.

### 2.4 Likely fix (subject to diagnosis)

Remove the redundant `setSelectedTourId(id)` from the navigating branches of `handleTourClick`. Only call it in the "stay put" case (non-product, non-artist paths). Let the path-aware hydration handle context update on the new URL.

```ts
const handleTourClick = useCallback(
  (id: string) => {
    closeDropdown();
    const productMatch = pathname?.match(/^\/(budget|advance|operations)\//);
    if (productMatch) {
      router.push(`/${productMatch[1]}/${id}`);
      return;
    }
    if (pathname?.startsWith('/artists/')) {
      router.push(`/budget/${id}`);
      return;
    }
    // Stay put — context update only.
    setSelectedTourId(id);
  },
  [setSelectedTourId, closeDropdown, pathname, router],
);
```

Same audit on `handleArtistClick`: if it calls `setSelectedArtistId(id)` before `router.push('/artists/[id]')`, remove the redundant setter.

### 2.5 Acceptance

- [ ] On `/budget/[A-tour]`, click tour B in switcher → URL becomes `/budget/[B-tour]` AND trigger updates to show "B's Artist · B-tour" within 100ms of click.
- [ ] Same for `/advance/*` and `/operations/*` paths.
- [ ] Page CONTENT also updates (not just URL) — the budget surface re-renders with the new tour's data.
- [ ] On a non-product non-artist path (e.g. `/personnel`), tour click → URL doesn't change, context updates only (regression check).
- [ ] Lint + typecheck clean.

### 2.6 Quote in report

- Post-fix `handleTourClick` body verbatim.
- Post-fix `handleArtistClick` body if changed.

### 2.7 Commit

`fix(shell-v2): handleTourClick lets path-aware hydration update context on navigation (closes trigger-label-stale bug)`

---

## 3. Phase 2 — Pane transition animations jump (~45 min)

### 3.1 Symptom (Adam's verbatim)

Panel open/close: smooth fade. Pane transitions (artist→tour, back): "still jumps."

So the panel `useLayoutEffect + animate()` pattern WORKS. The pane equivalent doesn't. Same code shape, different result.

### 3.2 Hypothesis (confirm or refute in diagnosis post)

Pane effect at `ArtistTourSwitcher.tsx:797` deps array includes `onExitDone`:

```ts
}, [mountAnim, onExitDone]);
```

If `onExitDone` is recreated on every parent render (i.e., not wrapped in `useCallback` inline at the call site, or its own useCallback has unstable deps), this effect runs every render → cancels the in-flight animation → starts a new one with the same parameters → which then gets cancelled on the next render. Result: animation never has time to play.

The panel animation effect runs only on `dropdownState` change (line 303), which is more stable. That's why panel works and pane doesn't.

### 3.3 Investigation step (post diagnosis to chat first)

1. Read where `<SwitcherPane onExitDone={...}>` is rendered (search for `SwitcherPane`).
2. Check whether `onExitDone` is wrapped in `useCallback` in the parent. If yes, check its deps for stability. If no, that's the bug.
3. Optionally: add `console.log('pane effect runs', mountAnim)` at the top of the pane animation effect. Click an artist, watch the log. If it logs more than 1-2 times per transition, the effect is over-running.

Post diagnosis:

```
Phase 2 diagnosis:
- onExitDone source: <where defined, useCallback or not, deps>
- Effect run frequency: <observed or predicted>
- Why animation cancels: <one sentence>
- Fix scope: <what changes>
```

Wait for Adam's sign-off.

### 3.4 Likely fix (subject to diagnosis)

Two options:

**A.** Wrap `onExitDone` in a stable `useCallback` at the call site with empty or minimal deps.

**B.** Use a ref-based callback inside `<SwitcherPane>`. The pane stores the latest `onExitDone` in a ref via a separate effect (no deps), and the animation onfinish reads from the ref.

```ts
// Inside SwitcherPane:
const onExitDoneRef = useRef(onExitDone);
useEffect(() => { onExitDoneRef.current = onExitDone; }, [onExitDone]);

// Then in the animation effect, replace onExitDone() with:
animRef.current.onfinish = () => { onExitDoneRef.current(); };

// And the deps array drops onExitDone:
}, [mountAnim]);
```

Option B is safer — any future caller that passes an inline `() => {...}` to `onExitDone` doesn't break the animation. Recommended.

### 3.5 Acceptance

- [ ] Click an artist in artists pane → smooth cross-slide to tours pane (~250ms, opacity + 8px translateX).
- [ ] Click back chevron in tours pane → smooth reverse cross-slide.
- [ ] No instant jumps. The eye sees a clear transition.
- [ ] `prefers-reduced-motion: reduce` → transitions collapse to instant or near-instant (≤50ms).
- [ ] Multiple rapid clicks (open dropdown, switch artist, switch back, switch artist) — animations don't break or get stuck mid-state.
- [ ] Lint + typecheck clean.

### 3.6 Quote in report

- The post-fix pane animation effect (deps array + onfinish callback path).
- The ref-pattern wiring if Option B (the useEffect that updates the ref + the onfinish that reads from it).

### 3.7 Commit

`fix(shell-v2): pane transition animations use stable callback ref (closes pane-jump bug)`

---

## 4. Phase 3 — Trigger redesign: single-row chip (~30 min)

### 4.1 Spec (Adam's call)

The two-row layout from Sprint 6.1 felt cramped and overflowed the ProductHeader bar height. New spec:

- **Layout**: `[avatar] Artist Name · Tour Name [chevron]` — single row.
- **Avatar**: 24px circle (smaller than the two-row 40px). Reuse the existing `<ArtistAvatar>` component.
- **Trigger height**: 36px (chip-like, fits the 48px ProductHeader without overflow).
- **Padding**: `var(--lp-space-2)` vertical, `var(--lp-space-3)` horizontal.
- **Separator**: a center dot " · " between artist name and tour name. `color: var(--lp-text-tertiary)`. Match the dot used in `<AdvanceShowContextBar>` so it's consistent.
- **Artist name**: `font-medium`, 14px, `var(--lp-text)`.
- **Tour name**: regular weight, 14px, `var(--lp-text-secondary)`.
- **Chevron**: 12px, `var(--lp-text-tertiary)`.
- **Background**: `var(--lp-panel)` rest, `var(--lp-panel-hover)` hover.
- **Open / active state**: 2px left-border in `var(--color-lp-orange)`. Border on the other three sides stays at `1px var(--lp-border)`.
- **Border-radius**: `var(--lp-radius-md)`.
- **Max-width**: `380px` (preserve from Sprint 6 to prevent overflow on narrow viewports).

Empty states:
- No artist: avatar slot is the dashed-circle User placeholder, single label "Pick an artist…" in `var(--lp-text-secondary)`.
- Artist but no tour: avatar + artist name + " · " + "Pick a tour…" in `var(--lp-text-tertiary)`.

### 4.2 Investigation note re: missing avatar

Adam's screenshot showed the trigger without an artist image — just text. Two possibilities:
- (A) The artist actually has no `branding.image_url` / `spotify_image_url` value in the DB → falls back to dashed-circle User placeholder OR the initials chip. If the placeholder is rendering, that's correct behavior, not a code bug.
- (B) The avatar slot is genuinely missing from the DOM → code bug.

**Investigation step**: open DevTools → Elements on the broken trigger. Check whether an `<img>` or initials chip element exists in the trigger DOM, even if invisible. If yes → data issue (artist has no image), surface to Adam in the report. If no → code bug, fix.

If it's a data issue: nothing to fix this sprint. Surface in "out of scope, deferred" — Adam can add a default fallback initials display if he wants by adding image fields to the artists table.

### 4.3 Acceptance

- [ ] Trigger renders single row, 36px tall.
- [ ] Avatar (24px circle) on left, with 8px gap to the text.
- [ ] Artist name · Tour name in single line, dot separator visible.
- [ ] Hover state visible (background change).
- [ ] Open state shows 2px orange left-border.
- [ ] Trigger doesn't overflow ProductHeader's 48px height.
- [ ] Empty states render correctly.
- [ ] Hex grep returns 0: `grep -n '#[0-9a-fA-F]\{3,8\}' src/components/shell-v2/ArtistTourSwitcher.tsx`.
- [ ] Lint + typecheck clean.

### 4.4 Quote in report

- Post-fix trigger button JSX (just the trigger render block, ~30 lines).
- Post-fix empty-state variants.
- Hex grep result (must be 0).
- Avatar investigation finding (data issue or code bug).

### 4.5 Commit

`fix(shell-v2): switcher trigger single-row chip with dot separator (closes overflow + cramped two-row)`

---

## 5. Phase 4 — Create-tour-then-select requires refresh (~45 min)

### 5.1 Symptom (Adam's verbatim)

> "PASS - but could only select the tour in the picker after refresh."

Sprint 6 Phase 2 sub-bug C — optimistic prepend was supposed to make the new tour appear in the switcher AND be selected immediately. The "appear" part works. The "selectable" part doesn't — user has to refresh the page before they can pick the new tour (which is also already supposedly selected).

### 5.2 Hypothesis (confirm or refute in diagnosis post)

Sprint 6 flow:
1. Slide-over POST → `/api/tours` → returns new row.
2. Slide-over fires `onCreated?.(newTour)` callback.
3. Wrapper's `handleTourCreated` prepends `newTour` to local `tours` state.
4. Slide-over calls `setSelectedTourId(newTourId)` from context.
5. Slide-over calls `onClose()` to close.
6. (Sprint 6 had `router.refresh()` here too — may or may not be in current code.)

The bug is most likely one of:
- **A.** `setSelectedTourId(newTourId)` from context fires `syncUrlParams` which writes URL `?tour_id=[new]&artist_id=[X]`. But the wrapper's `tours` state doesn't include the new tour yet (microtask ordering with the optimistic prepend), so the trigger renders "Pick a tour…" until the next render cycle. Adam's "after refresh" comment suggests this resolves on its own once everything settles, but the user perceives it as broken.
- **B.** The new tour appears in the wrapper's local `tours` but the switcher's tour-list rendering uses `initialTours` (server-fetched prop) instead of local state. So the new tour is in state but the dropdown renders from prop → user doesn't see it as selectable. Refresh re-fetches `initialTours` server-side, includes the new tour, list updates.
- **C.** Race between optimistic update + context setter + slide-over close. State inconsistency that resolves on remount.

### 5.3 Investigation step (post diagnosis to chat first)

1. Read `TourCreateSlideOver.tsx` submit success path. Quote it.
2. Read wrapper's `handleTourCreated` and check what reads from `tours` state vs `initialTours` prop.
3. Read switcher's tours-list render to confirm it's reading from the wrapper's `tours` state, not from a separately-passed prop.
4. Run the broken page locally if you can (`npm run dev`), open create-tour, submit, watch DevTools Network for the POST and Components panel for state propagation.

Post diagnosis:

```
Phase 4 diagnosis:
- Submit success path: <chain>
- Where the new tour is missing: <which component reads stale data>
- Why refresh fixes it: <one sentence>
- Fix scope: <what changes>
```

Wait for Adam's sign-off.

### 5.4 Likely fix (subject to diagnosis)

Most likely (Hypothesis B): the switcher's tour-list is reading from `initialTours` prop instead of wrapper's local `tours` state. Wrapper's `setTours((prev) => [tour, ...prev])` updates local state but the switcher prop doesn't reflect it.

Fix: pass wrapper's local `tours` (or a `tours` prop derived from local state) to the switcher instead of `initialTours`. Wrapper becomes the source of truth post-mount; `initialTours` is only used for the very first render.

If Hypothesis A: the order of operations in submit success needs `await`-ing the context setter or a small queueMicrotask boundary.

If Hypothesis C: a useEffect that syncs context selection AFTER the local state update settles (one render later).

### 5.5 Acceptance

- [ ] Open create-tour slide-over, fill form, submit.
- [ ] On success: slide-over closes, toast appears, switcher's tour list now includes the new tour at the top of its year, and the new tour is selected (visible in trigger AND highlighted in the list when reopened).
- [ ] No page refresh required to interact with the new tour.
- [ ] Click the new tour in the (re-opened) switcher → navigates correctly to product URL with new tour ID.
- [ ] Lint + typecheck clean.

### 5.6 Quote in report

- Post-fix submit success path in `TourCreateSlideOver.tsx`.
- Post-fix state propagation in `ArtistTourSwitcherClientWrapper.tsx`.

### 5.7 Commit

`fix(shell-v2): create-tour optimistic update propagates to switcher selection (no refresh needed)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all four phases land.

1. On `/budget/[A]`, click tour B in switcher → URL becomes `/budget/[B]`, page content updates, trigger label shows "B's Artist · B-Tour" within 100ms. PASS / FAIL.
2. Open dropdown — smooth panel fade-in (Sprint 6.1 win, regression check). PASS / FAIL.
3. Click an artist → smooth pane cross-slide. NOT a jump. PASS / FAIL.
4. Click back chevron → reverse cross-slide smoothly. PASS / FAIL.
5. Trigger renders single-row, 36px tall, 24px avatar, dot separator, no overflow. PASS / FAIL.
6. Open state shows 2px orange left-border. PASS / FAIL.
7. Create new tour via slide-over → new tour appears in switcher list AND is selected immediately, no refresh required. PASS / FAIL.
8. `prefers-reduced-motion: reduce` → all animations collapse to ≤50ms. PASS / FAIL.
9. Console clean — no errors, no "Maximum update depth," no throttle warnings.
10. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

If 1, 3, 5, 7 all pass → ready to merge.

---

## When done — report exactly this format

```
Sprint 6.2 done. Branch: fix/sprint-6.2-regressions (off Sprint 6.1 branch)
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2): handleTourClick lets path-aware hydration update context
- 2: <hash> fix(shell-v2): pane transition animations stable callback ref
- 3: <hash> fix(shell-v2): switcher trigger single-row chip with dot separator
- 4: <hash> fix(shell-v2): create-tour optimistic update propagates to switcher

Phase 1 diagnosis posted at <ts>, signed off at <ts>.
Phase 2 diagnosis posted at <ts>, signed off at <ts>.
Phase 4 diagnosis posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] handleTourClick body
[Phase 2] pane animation effect + ref pattern
[Phase 3] trigger JSX + empty-state variants + hex grep result + avatar investigation finding
[Phase 4] submit success path + wrapper state propagation

V.1-10 results:
1. <pass/fail>
... (all 10)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **TourCreateSlideOver field expansion** (Adam-flagged: "we need to collect more information in that menu too. Routing etc is important to the rest of the system, so maybe we add a slide over wizard for that too"). Separate sprint.
2. **Workspace `/artists` page on old design** — Sprint 7 target.
3. **`/artists/[id]` artist detail page redesign** — Sprint 7 target.
4. **`handleTourCreated` artist-mismatch race** — flagged in Sprint 6.1, still deferred.
5. **Five baseline `react-hooks/set-state-in-effect` errors in ArtistTourContext** — separate cleanup sprint.
6. **POST /api/tours response shape consistency** — separate sprint.
7. **TourWizard currency cleanup** — separate sprint.
8. **Status pill 10s + page reload** — separate sprint.
9. **Print button regression in read mode** — separate sprint.
10. **Custom field plus button broken** — chrome cleanup sprint.
11. **404 pages have no return-to-home button** — P3.

If you find another bug while doing this sprint, note it in the report's "out of scope, deferred" section. Don't fix it.
