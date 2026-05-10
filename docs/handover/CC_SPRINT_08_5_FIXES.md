# CC Sprint 8.5 — Sprint 8.3 architectural retry + 8.4 polish

Sprint 8.3 §1 moved switcher STATE to workspace context. Context survives same-product nav, but the DROPDOWN DOM still unmounts because the switcher COMPONENT itself is in the per-product layout subtree. Result: user sees close+reopen flash. Real fix: hoist the switcher component (not just state) to `(app)/layout.tsx`.

Plus three smaller fixes from Adam's smoke (8.3.5 scrollable dropdown, 8.3.8 location autofill regression, 8.4.2 banner refresh).

**Branch off `feat/sprint-8.4-artist-hub`** (NOT main; stacks on top of 8.1+8.2+8.3+8.4). Five commits + V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_3_ARCHITECTURAL.md` — context for SwitcherStateContext (Sprint 8.5 keeps it; just hoists the component too)
- `src/app/(app)/layout.tsx` — Phase 1 mount target
- `src/components/shell-v2/ProductHeader.tsx` — Phase 1 source (switcher gets removed from here)
- `src/components/shell-v2/AppShell.tsx` — Phase 1 mount surface
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — Phase 2 (scrollable) + Phase 3 (location autofill regression)
- `src/components/routing/VenueAutocomplete.tsx` — Phase 3 target (Sprint 8.3 §2 4d fix removed Tab handler — investigate side effects)
- `src/components/artists/ArtistEditSlideOver.tsx` — Phase 4 (banner refresh)
- `src/components/artists/ArtistImageUploader.tsx` — Phase 4 + Phase 5 reference

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Five commits in numeric order: 1 → 2 → 3 → 4 → 5.
7. Verify before claiming. Quote post-fix file:line.
8. **Phase 1 + Phase 3 require diagnosis-and-halt.** Phase 1 is architectural (hoisting switcher to workspace level changes ProductHeader's role). Phase 3 is a regression (need to find what broke location autofill).
9. **Phases 2 + 4 + 5 ship continuously without sign-off** — mechanical or low-risk.
10. Halt criteria same as 8.4: hard data corruption, build break, lint exceeded, missing structural assumption.

---

## 2. Phase 1 — Hoist switcher to workspace layout (real fix) (~2.5 hr)

### 2.1 Goal

Sprint 8.3 §1 made the dropdown STATE survive remount via context, but the wrapper component itself still re-mounts on `[id]` changes. The DOM unmount causes a visible flash even though state restores correctly. The complete fix: move the switcher component out of per-product layouts into `(app)/layout.tsx` so the DOM persists.

### 2.2 Investigation step (post diagnosis to chat for sign-off)

Read the current architecture:

- `src/app/(app)/layout.tsx` — workspace-level, mounts `<AppShell>` and the four context providers.
- `src/components/shell-v2/AppShell.tsx` — the workspace shell. What does it render? Check whether it has a top-bar slot that could host the switcher.
- `src/components/shell-v2/ProductHeader.tsx` — currently contains: switcher (left), product name (center), search + avatar (right). Decide which pieces stay here and which move up.
- `src/components/shell-v2/ProductRail.tsx` — left rail with product icons. Stays per-product.

Decide the new structure:

**Option A**: Switcher moves to `<AppShell>` directly. ProductHeader stays per-product but loses the switcher (now thin: product name + search + avatar).

**Option B**: Switcher moves to a NEW workspace-level top bar that wraps AppShell. ProductHeader retired.

**Option C**: Switcher moves to (app)/layout.tsx as a sibling of AppShell. ProductHeader stays as-is per-product but its switcher slot becomes a placeholder.

Pick whichever fits the existing structure with minimum churn. **My guess: Option A** — AppShell already exists at workspace level; render the switcher inside it as a top bar.

**Diagnosis post:**

```
Phase 1 diagnosis:
- AppShell current responsibilities: <list>
- Picked Option: <A/B/C>
- Switcher mount site: <file:line, must be above the dynamic-segment subtree>
- ProductHeader changes: <what stays, what gets removed>
- Active-product indication: <how the switcher knows which product is active — likely useProductContext()>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 2.3 Fix scope (subject to diagnosis)

Whatever option signed off:

1. Mount `<ArtistTourSwitcherClientWrapper>` at workspace level (in `<AppShell>` or `(app)/layout.tsx` directly).
2. Remove the switcher mount from `<ProductHeader>`.
3. Pass `selectedArtist`, `selectedTour`, etc. to the workspace-mounted wrapper. The wrapper already reads these from `ArtistTourContext` (workspace-level), so this should be straightforward.
4. The `currentArtist` and `currentTour` server-fetched data that ProductHeader currently passes through wrappers... where does that come from now? If from the per-product layout, it can't come up to workspace level easily. Fall back to client-side fetch in the wrapper if needed (it already has tours fetch logic).
5. Verify `useProductContext()` works inside the workspace-mounted switcher (should — the context is at workspace level).

The architectural goal: the switcher's React tree position is ABOVE any dynamic segment. Same-product nav, cross-product nav, browser back/fwd — none cause DOM unmount of the switcher.

### 2.4 Acceptance

- [ ] On `/artists/[A]`, click artist B in switcher → URL changes, dropdown stays visually open with NO close+reopen flash. Same DOM element throughout.
- [ ] Same on `/budget/[A]` → switcher → tour B → `/budget/[B]` (the 8.3.2 failure). NO flash.
- [ ] Cross-product nav (`/artists/[A]` → `/budget/[X]`) → dropdown closes (existing cross-product close handler still works). PASS.
- [ ] Browser back/fwd → dropdown stays closed.
- [ ] React DevTools confirms `<ArtistTourSwitcherClientWrapper>` does NOT re-mount on `[id]` change OR on cross-`[id]` same-product nav.
- [ ] Lint + typecheck clean.

### 2.5 Quote in report

- Diagnosis sign-off timestamp.
- The new mount site for the switcher.
- ProductHeader changes (lines removed).
- Any data-flow changes needed.

### 2.6 Commit

`refactor(shell-v2): hoist switcher to workspace layout — true DOM persistence (Sprint 8.5 §1)`

---

## 3. Phase 2 — Scrollable dropdown (~30 min, mechanical)

### 3.1 Symptom (Adam's smoke)

> "the switcher isnt scrollable so after there are 8 entries in either form, you can't get lower than that to access other artists OR the create new artist/tour button"

When artists or tours list overflows the dropdown's natural height, content gets clipped. The "+ Create new artist/tour" CTAs at the bottom become unreachable.

### 3.2 Fix

In `ArtistTourSwitcher.tsx` dropdown panel render:

- Add `max-height: min(70vh, 600px)` to the dropdown panel.
- Add `overflow-y: auto` on the inner content area (NOT the panel itself — the create CTAs need to stay sticky at the bottom).

Better structure:

```tsx
<div className="lp-ats-panel" style={{ maxHeight: 'min(70vh, 600px)', display: 'flex', flexDirection: 'column' }}>
  <div style={{ overflowY: 'auto', flex: 1 }}>
    {/* artists list / tours list */}
  </div>
  <div style={{ flexShrink: 0 }}>
    {/* + Create new ... CTA — always visible at bottom */}
  </div>
</div>
```

Pane animations (left/right cross-slide on artist→tour) preserved — wrap each pane in the same flex structure.

### 3.3 Acceptance

- [ ] Switcher dropdown with 20+ artists or 20+ tours: list scrolls vertically.
- [ ] Create CTA always visible at bottom regardless of scroll.
- [ ] Pane cross-slide animation still smooth.
- [ ] Lint + typecheck clean.

### 3.4 Quote in report

- The post-fix dropdown panel structure.

### 3.5 Commit

`fix(shell-v2): switcher dropdown scrollable past 8 entries (Sprint 8.5 §2)`

---

## 4. Phase 3 — Location autofill regression (DIAGNOSIS REQUIRED) (~75 min)

### 4.1 Symptom (Adam's smoke)

> "When picking a location, it doesnt fill the address"

Sprint 8.3 §2 4b fix made the autocomplete dropdown visible. But picking a result no longer fills the address column. Sprint 8.2 worked differently (Tab handler implicitly picked first suggestion, populating address). Sprint 8.3 §2 removed the Tab handler. Now click-pick is the only path, and it doesn't appear to fire `onPlaceSelect` correctly.

### 4.2 Investigation step (post diagnosis to chat for sign-off)

Open the broken page locally OR Vercel preview. Type a venue name in TourCreateSlideOver page 2's location cell. Observe:

1. Network tab: does the autocomplete fetch fire? What does it return?
2. Click a result in the visible dropdown.
3. Does `handleSelect` fire? Add a `console.log` if needed.
4. Does `onPlaceSelect` fire on the parent (RoutingGrid)?
5. Does the parent's handler write to the address column?

Possible causes:
- **A.** Tab handler removal accidentally broke click-handler too (shouldn't — different code paths, but trace to confirm).
- **B.** `onBlur` from Sprint 8.2 §4d fires AFTER click, overwriting the address with current text input value.
- **C.** Click event doesn't reach `handleSelect` because of dropdown z-index or pointer-events (less likely now that visibility is fixed).
- **D.** `onPlaceSelect` always populated address but RoutingGrid's parent handler was never wiring `result.address` to the row's `address` field.

**Diagnosis post:**

```
Phase 3 diagnosis:
- Click handler trace: <does handleSelect fire? does onPlaceSelect fire? does parent write address?>
- Root cause: <one paragraph>
- Fix scope: <what changes>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 4.3 Fix (subject to diagnosis)

Targeted to actual cause. Likely candidates:
- Re-enable address-fill in onPlaceSelect handler if it was severed.
- Sequence onBlur AFTER click events so click doesn't lose to blur (`setTimeout(handleBlur, 200)` is the conventional trick, OR use `onMouseDown` instead of `onClick` for the suggestion items so blur fires after the pick).
- Wire up RoutingGrid's parent handler if it was missing.

### 4.4 Acceptance

- [ ] Type a location in TourCreateSlideOver page 2 → suggestions visible.
- [ ] Click a suggestion → location field gets the venue name AND address column gets the formatted address AND lat/lng populate.
- [ ] Manual edit of location text after click + blur → address stays unchanged (Sprint 8.3 §2 4d behavior preserved).
- [ ] Tab key blurs normally without picking (Sprint 8.3 §2 4d behavior preserved).
- [ ] Drive time band appears between two consecutive show rows once locations populate.
- [ ] Lint + typecheck clean.

### 4.5 Quote in report

- Diagnosis sign-off timestamp.
- Click + onPlaceSelect + address-write trace observations.
- The post-fix change.

### 4.6 Commit

`fix(routing): location autofill restored on click pick (Sprint 8.5 §3 — closes 8.3.8 regression)`

---

## 5. Phase 4 — Banner upload immediate visibility (~30 min)

### 5.1 Symptom (Adam's smoke)

> "PASS on refresh"

The banner upload commits to DB but the artist hero on `/artists/[id]` doesn't reflect it until the user manually refreshes. Logo upload works immediately (likely because the trigger reads from local state synchronously); banner doesn't.

### 5.2 Fix scope

After successful banner upload in `ArtistImageUploader`, the `<ArtistEditSlideOver>` should:
- Update local component state with the new banner URL (it likely already does for the in-slide-over preview).
- After Save (or after the upload commits if Save isn't required), call `router.refresh()` to revalidate the page's server-rendered hero.

OR: if the slide-over already calls `router.refresh()` on close, ensure it fires AFTER the upload commit, not before.

Investigate and fix. Mechanical once root cause found.

### 5.3 Acceptance

- [ ] Open Edit profile slide-over → upload banner → close slide-over → hero on `/artists/[id]` reflects new banner without manual refresh.
- [ ] Same for logo (regression check).
- [ ] Lint + typecheck clean.

### 5.4 Quote in report

- The post-fix refresh trigger.

### 5.5 Commit

`fix(artists): banner upload visible immediately, no manual refresh (Sprint 8.5 §4)`

---

## 6. Phase 5 — Image cropping (optional; ship if time allows) (~90 min)

### 6.1 Goal

Adam's smoke: "needs to allow cropping to align the photo in both upload boxes."

Logo (square 120px display) and banner (240px tall full-width) need different aspect ratios. Auto-fit via `object-fit: cover` works but cuts off arbitrary parts of the image. User wants control.

### 6.2 Decisions made (no halt)

- **Aspect ratios**: logo = 1:1 (square), banner = 16:5 (matches the 240px-tall full-width hero).
- **UI**: after file selection, show a crop modal/overlay with the image and a draggable crop window in the locked aspect ratio.
- **Library**: NO new dependencies (Hard Rule 1). Use a minimal hand-rolled cropper:
  - User drags the image inside the crop frame.
  - Pinch/scroll to zoom.
  - Confirm crops to canvas + reuploads.
- **Skippable**: "Use full image" button bypasses crop, falls through to current behavior.

If hand-rolling a cropper is too much for the time budget, ship logo/banner uploads WITHOUT cropping (current behavior) and defer cropping to Sprint 9. Don't introduce a new dep just to save time.

### 6.3 Acceptance

- [ ] After file selection, crop modal opens.
- [ ] User can drag/zoom to position the image.
- [ ] Confirm crops the image to a canvas blob in the correct aspect ratio.
- [ ] The cropped blob uploads instead of the original.
- [ ] "Use full image" bypasses crop.
- [ ] Lint + typecheck clean.

### 6.4 Quote in report

- The cropper component.
- The integration with ArtistImageUploader.

### 6.5 Commit

`feat(artists): image cropping for logo + banner upload (Sprint 8.5 §5)`

If deferred: skip the commit and note in report that Phase 5 was deferred to Sprint 9 due to time budget.

---

## V. Verify (~30 min)

CC: cannot run live UI tests. Static checks only:

1. Lint baseline 75/120 held.
2. Typecheck zero.
3. Build succeeds.
4. Hex grep across new files returns zero non-orange-transparent matches.
5. Quote post-fix file:line per acceptance criterion.

Adam runs the live smoke after.

---

## When done — report exactly this format

```
Sprint 8.5 done. Branch: fix/sprint-8.5-fixes (off Sprint 8.4 branch)
Vercel preview: <URL>

Commits in order:
- 1: <hash> refactor(shell-v2): hoist switcher to workspace layout
- 2: <hash> fix(shell-v2): switcher dropdown scrollable
- 3: <hash> fix(routing): location autofill restored on click pick
- 4: <hash> fix(artists): banner upload visible immediately
- 5: <hash or "deferred to Sprint 9"> feat(artists): image cropping

Phase 1 diagnosis posted at <ts>, signed off at <ts>.
Phase 3 diagnosis posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] AppShell mount + ProductHeader changes + data flow
[Phase 2] dropdown panel structure with scroll + sticky CTAs
[Phase 3] click handler trace + fix
[Phase 4] refresh trigger
[Phase 5] cropper if shipped, or deferred

V.1-5 results:
1. Lint: <X errors / Y warnings>
2. Typecheck: zero
3. Build: OK
4. Hex grep: zero
5. Quoted

Out of scope, deferred:
[list anything found]
```

---

## Out of scope this sprint (DO NOT touch)

1. **TourWizard retirement** — separate sprint.
2. **Phase 4 Operations migration** — explicitly excluded.
3. **Spotify search → genre extension** — Sprint 9.
4. **AdvanceOverviewStatsStrip orphan deletion** — cleanup sprint.
5. **`<DangerConfirmModal>` primitive extraction** — refactor opportunity.
6. **Per-user `tour_visits` table** — Sprint 8.2 deferred.
7. **Storage cleanup budget-files / advance-files** — Sprint 8.2 deferred.
8. **Migration 068 proper exemption** — bypassed via _lp_migrations row.
9. **5 baseline lint errors in ArtistTourContext, RoutingGrid line 137, hotel-rate.ts** — long-deferred.
10. **404 page CTAs**, **print button regression**, **status pill autosave**, **custom field plus button** — long-deferred.
11. **Workspace activity feed time-bounding + actor IDs for non-advance sources** — Sprint 8.4 deferred.
12. **Legacy /api/upload/artist-asset route cleanup** — Sprint 8.4 deferred.
13. **Storage cleanup §5 verification** — still pending; Adam tests after operations exists.

If you find another bug — note in deferred. Don't fix.
