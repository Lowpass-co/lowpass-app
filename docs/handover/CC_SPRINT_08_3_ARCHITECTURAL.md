# CC Sprint 8.3 — Sprint 8.2 architectural fixes (no new features)

Sprint 8.2 shipped 4 of 7 phases cleanly. Three failures remain — all architectural, requiring real diagnosis instead of guesses. This sprint closes them. No new features.

**Branch off `fix/sprint-8.2-fixes`** (NOT main — 8.1 + 8.2 not yet merged; 8.3 stacks on top). Three commits + V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_2_FIXES.md` (Sprint 8.2 context — sessionStorage approach + RoutingGrid z-index attempt + Pick Up cache invalidation)
- `src/app/(app)/layout.tsx` — Phase 1 hoisting target (workspace-level layout that wraps every authenticated page)
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — Phase 1 state extraction target
- `src/components/shell-v2/ArtistTourSwitcherClientWrapper.tsx` — Phase 1 wrapper state extraction target
- `src/contexts/ArtistTourContext.tsx` — Phase 1 reference; new `<SwitcherStateContext>` lives alongside it
- `src/components/routing/RoutingGrid.tsx` — Phase 2 target with `compact?` prop from Sprint 8.1 §4
- `src/components/routing/VenueAutocomplete.tsx` — Phase 2 sub-bug 4b/4d target
- `src/components/routing/DayTypeDropdown.tsx` — Phase 2 sub-bug 4a target
- `src/app/api/tours/[id]/route.ts` — Phase 3 verification (Sprint 8.2 §5 storage cleanup)

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Three commits in numeric order: 1 → 2 → 3.
7. Verify before claiming. Quote post-fix file:line.
8. **Phase 1 + Phase 2 require diagnosis-and-halt with real runtime evidence** (React DevTools "Highlight Updates" trace for Phase 1, DOM inspection for Phase 2). Sprint 8.2's guesses didn't take. Don't guess again.
9. Phase 3 is mechanical verification.
10. **Halt criteria** (same as 8.1 / 8.2):
    - Irreversible data action you weren't authorized for.
    - Migration would conflict with existing data.
    - Phase 1 OR Phase 2 diagnosis comes back inconclusive — surface, wait for Adam.
    - Lint baseline exceeded.
    - Build doesn't compile.

---

## 2. Phase 1 — SwitcherStateContext at workspace layout (~2 hr)

### 2.1 Goal

Sprint 8.2 §2 used sessionStorage to preserve dropdown state across wrapper remount. It works but produces a visible close+reopen flash on artist switch — the wrapper IS still remounting, sessionStorage just rehydrates it. Adam: "it navigates to the artist with a jump, closes the switcher and opens it (very quickly) because the switcher still doesn't animate."

The proper fix is to move switcher state ABOVE the per-product layout, into the workspace-level layout that NEVER unmounts. State doesn't need rehydration if it never leaves memory.

§3 (new artist not in switcher until refresh) shares the same root cause — `createdArtists` is in the wrapper's local state, lost on remount despite sessionStorage.

This phase fixes BOTH §2 and §3 with one architectural change.

### 2.2 Investigation step (post diagnosis to chat for sign-off)

Before writing code, verify the architectural assumption with React DevTools:

1. Run `npm run dev` (install pg first if needed: `npm install --save-dev pg`).
2. Open `/artists/[any-id]` in Chrome.
3. DevTools → React DevTools → Components tab → enable "Highlight updates when components render."
4. Click the switcher trigger → wait for paint to settle → click an artist row to switch.
5. Identify EXACTLY which component(s) re-mount (disappear + reappear) vs re-render (orange flash, stay mounted).

Confirm the hypothesis: `<ArtistTourSwitcher>` and `<ArtistTourSwitcherClientWrapper>` re-mount on `[id]` change. `<ArtistTourProvider>` (at `(app)/layout.tsx:32`) does NOT re-mount.

Identify the lowest-level component above the switcher that does NOT re-mount on `[id]` change. That's where `<SwitcherStateContext.Provider>` mounts.

**Diagnosis post:**

```
Phase 1 diagnosis:
- Confirmed re-mount of: <list of components>
- Confirmed persisted across [id] change: <list of components>
- SwitcherStateContext mount site: <file:line, must NOT remount on params change>
- State migrating to context: dropdownState, pane, exitingPane, paneDirection, createdArtists, [anything else?]
- sessionStorage from Sprint 8.2: <delete entirely OR keep as belt-and-suspenders fallback>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 2.3 Fix scope (subject to diagnosis)

Create `src/contexts/SwitcherStateContext.tsx`:

```ts
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import type { ArtistMin } from '@/components/shell-v2/ArtistTourSwitcherClientWrapper';

type DropdownState = 'closed' | 'open' | 'closing';
type Pane = 'artists' | 'tours';
type PaneDirection = 'forward' | 'back';

interface SwitcherStateContextType {
  dropdownState: DropdownState;
  setDropdownState: (s: DropdownState) => void;
  pane: Pane;
  setPane: (p: Pane) => void;
  exitingPane: Pane | null;
  setExitingPane: (p: Pane | null) => void;
  paneDirection: PaneDirection;
  setPaneDirection: (d: PaneDirection) => void;
  createdArtists: ArtistMin[];
  setCreatedArtists: (a: ArtistMin[] | ((prev: ArtistMin[]) => ArtistMin[])) => void;
}

const Ctx = createContext<SwitcherStateContextType | null>(null);

export function SwitcherStateProvider({ children }: { children: ReactNode }) {
  const [dropdownState, setDropdownState] = useState<DropdownState>('closed');
  const [pane, setPane] = useState<Pane>('artists');
  const [exitingPane, setExitingPane] = useState<Pane | null>(null);
  const [paneDirection, setPaneDirection] = useState<PaneDirection>('forward');
  const [createdArtists, setCreatedArtists] = useState<ArtistMin[]>([]);

  return (
    <Ctx.Provider value={{
      dropdownState, setDropdownState,
      pane, setPane,
      exitingPane, setExitingPane,
      paneDirection, setPaneDirection,
      createdArtists, setCreatedArtists,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSwitcherState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSwitcherState must be used within SwitcherStateProvider');
  return ctx;
}
```

Mount in `src/app/(app)/layout.tsx` alongside `<ArtistTourProvider>`:

```tsx
<ArtistTourProvider>
  <SwitcherStateProvider>
    {children}
  </SwitcherStateProvider>
</ArtistTourProvider>
```

Refactor `<ArtistTourSwitcher>` and `<ArtistTourSwitcherClientWrapper>` to read these state slices from `useSwitcherState()` instead of `useState`. The components themselves still re-mount on `[id]` change, but their state lives in the workspace-level provider that doesn't.

**sessionStorage cleanup (subject to diagnosis sign-off):**
- If diagnosis confirms context-only is sufficient: delete the sessionStorage read/write code from Sprint 8.2 §2. State lives in context only.
- If diagnosis suggests browser tab close should retain state across page reload: keep sessionStorage as belt-and-suspenders. The provider reads sessionStorage on its initial mount (lazy initial state) and writes on change.

Adam's call in the sign-off.

### 2.4 Acceptance

- [ ] On `/artists/[A]`, click artist B in switcher → URL changes to `/artists/[B]`, dropdown stays visually open through navigation. NO close-and-reopen flash.
- [ ] Same on tour-product surfaces (`/budget/[A]` → switcher → tour B → `/budget/[B]`).
- [ ] Cross-product navigation (`/artists/[A]` → `/budget/[X]`) — dropdown closes (expected, different product).
- [ ] Browser back/fwd — dropdown stays closed (Sprint 7 §1.A regression check).
- [ ] Create new artist via slide-over → page navigates → switcher's artists pane includes new artist immediately. NO refresh required.
- [ ] If sessionStorage was kept: tab close + reopen → dropdown opens to last state.
- [ ] If sessionStorage was deleted: tab close + reopen → dropdown defaults to closed (acceptable).
- [ ] React DevTools confirms `<SwitcherStateProvider>` does NOT re-mount on `[id]` change.
- [ ] Lint + typecheck clean.

### 2.5 Quote in report

- Diagnosis sign-off timestamp.
- React DevTools observations (verbatim).
- New `SwitcherStateContext.tsx` (full content if ≤80 lines).
- Mount site in `(app)/layout.tsx`.
- Refactored `useSwitcherState()` consumers in switcher + wrapper.
- sessionStorage decision (delete or keep).

### 2.6 Commit

`refactor(shell-v2): SwitcherStateContext at workspace layout (Sprint 8.3 §1 — true fix for cross-product remount)`

---

## 3. Phase 2 — RoutingGrid compact mode bugs (real diagnosis this time) (~2 hr)

### 3.1 Goal

Sprint 8.2 §4 bumped `--lp-z-dropdown` 1000 → 1300 to fix invisible day-type dropdown + venue picker. **It didn't help.** Adam's smoke confirms 4a, 4b, 4c, 4d all still fail. The z-index hypothesis was wrong.

This phase requires real DevTools-driven diagnosis per sub-bug.

### 3.2 Investigation step (post diagnosis to chat for sign-off)

For EACH of 4a, 4b, 4c, 4d, open the broken page (the TourCreateSlideOver page 2 with embedded RoutingGrid), reproduce the bug, inspect with DevTools.

**4a — Day-type dropdown empty:**

1. Open the TourCreateSlideOver to page 2.
2. Click a day_type cell.
3. Open DevTools Elements panel. Find the dropdown component in the DOM. Is it:
   - (a) Not in the DOM at all? Check if it's conditionally rendered. Inspect `DayTypeDropdown.tsx` rendering logic.
   - (b) In the DOM but with `display: none` or `visibility: hidden`? Trace the CSS.
   - (c) In the DOM, visible, but with empty `<option>` list? Inspect the options array in React DevTools — is the `DAY_TYPES` constant populated?
   - (d) In the DOM, visible, options present, but positioned off-screen? Check `getBoundingClientRect()`.

**4b — Venue picker not visible:**

1. Click in the location/venue cell.
2. Type "tab" or similar. Suggestions should fetch from Google Places.
3. Inspect the suggestions dropdown:
   - (a) Does the network tab show the autocomplete request firing? If no, the input isn't triggering the fetch.
   - (b) If yes, does the response contain results? If empty, Google API issue.
   - (c) If results present, where does the dropdown render? Check if a portal exists. Check positioning. Check `overflow: hidden` on any ancestor.

**4c — Drive time not showing:**

This auto-resolves if 4b works (venues populated → lat/lng populated → drive time computes). Re-test after 4b is fixed; if it STILL doesn't show, separate diagnosis: is `useGoogleDrive` enabled in compact mode? Are coords actually populated post-pick?

**4d — Address overrides on edit:**

1. Pick a Google Place. Verify location + address fill.
2. Click in the location cell, edit text manually (not via dropdown pick).
3. Click elsewhere to blur.
4. Observe: does the address change?

The Sprint 8.2 §4d fix added `onBlur` to `VenueAutocomplete`. Inspect the component to see if `onBlur` actually fires. Trace what setState/onChange call it triggers.

**Diagnosis post:**

```
Phase 2 diagnosis:
- 4a — root cause: <one paragraph>
- 4b — root cause: <one paragraph>
- 4c — auto-resolves with 4b? <yes/no, evidence>
- 4d — root cause: <one paragraph>
- Fix scope per sub-bug: <one line each>
- Confidence: <high/medium/low per sub-bug>
```

Wait for Adam's sign-off.

### 3.3 Fix scope (subject to diagnosis)

Each sub-bug fix is targeted to its actual cause. No more guessing at z-index when the issue might be `display: none` somewhere.

If multiple sub-bugs share a root cause (e.g. an ancestor `overflow: hidden` clipping all dropdowns), fix once. If each is independent, fix each.

### 3.4 Acceptance

- [ ] **4a**: click day_type cell → dropdown visible with options (Show / Travel / Day off / Press / Hold).
- [ ] **4b**: type a location → Google Places suggestions visible. Pick a result → location + address + lat/lng + city + country populate.
- [ ] **4c**: two consecutive show rows with picked locations → drive time band visible between them.
- [ ] **4d**: pick a location → address fills → edit location text manually + blur → address stays unchanged.
- [ ] No regression on the full RoutingGrid (non-compact mode in operations).
- [ ] Lint + typecheck clean.

### 3.5 Quote in report

- Diagnosis sign-off timestamp.
- DevTools observations per sub-bug (verbatim).
- Each fix's before/after.

### 3.6 Commit

`fix(routing): RoutingGrid compact mode bugs — real fix per sub-bug (Sprint 8.3 §2)`

---

## 4. Phase 3 — Storage cleanup §5 verification (~15 min mechanical, may need no code)

### 4.1 Goal

Sprint 8.2 §5 added storage cleanup before tour DB delete. Adam couldn't test ("can't test till opps is working"). Now operations is presumably accessible. Verify the cleanup works.

### 4.2 Verification step

Have Adam (or CC if a test workspace is accessible) delete a test tour with rider-asset / deal-memo / receipt files attached. Then check Supabase Storage UI for those buckets:

- `rider-assets` — folder/files for the tour: GONE.
- `deal-memos` — same.
- `receipts` — same.

If files persist, the storage cleanup didn't fire. Investigate `src/app/api/tours/[id]/route.ts` DELETE handler:
- Is the storage cleanup code actually being reached?
- Are the path enumerations returning the expected paths?
- Is `storage.from(bucket).remove(...)` failing silently?

If files are gone, mark §5 PASS and ship a no-op commit (or skip the commit and just confirm in the report).

### 4.3 Acceptance

- [ ] Delete a tour with attached files → those files are removed from Supabase Storage buckets.
- [ ] DB delete still succeeds.
- [ ] OR no code change needed; mark verification complete.

### 4.4 Quote in report

- The verification result.
- If a fix was needed, the change.

### 4.5 Commit

If a fix was needed:
`fix(api): tour delete storage cleanup (Sprint 8.3 §3 — closes 8.2 §5)`

If no fix needed: skip the commit. Note in the report that Phase 3 was verification-only and passed.

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all phases land.

1. Phase 1 — `/artists/[A]` → click artist B in switcher → dropdown stays open through navigation, NO close-and-reopen. PASS / FAIL.
2. Phase 1 — same on `/budget/[A]` → switcher → tour B → `/budget/[B]`. PASS / FAIL.
3. Phase 1 — cross-product nav (`/artists` → `/budget/[X]`) closes dropdown (expected). PASS / FAIL.
4. Phase 1 — create new artist via slide-over → page navigates → new artist visible in switcher immediately, no refresh. PASS / FAIL.
5. Phase 2 — RoutingGrid in TourCreateSlideOver page 2 → click day_type cell → options visible. PASS / FAIL.
6. Phase 2 — type a venue → Google Places suggestions visible → pick a result → location + address + coords fill. PASS / FAIL.
7. Phase 2 — two consecutive show rows with locations → drive time band visible. PASS / FAIL.
8. Phase 2 — edit location text after pick + blur → address unchanged. PASS / FAIL.
9. Phase 3 — delete tour with files → Supabase Storage buckets clean. PASS / FAIL.
10. Console clean.
11. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

If 1, 4, 5, 6 fail → halt and surface to Adam.

---

## When done — report exactly this format

```
Sprint 8.3 done. Branch: fix/sprint-8.3-architectural (off Sprint 8.2 branch)
Vercel preview: <URL>

Commits in order:
- 1: <hash> refactor(shell-v2): SwitcherStateContext at workspace layout
- 2: <hash> fix(routing): RoutingGrid compact mode bugs — real fix per sub-bug
- 3: <hash or N/A> fix(api): tour delete storage cleanup (or "verification only — no commit")

Phase 1 diagnosis posted at <ts>, signed off at <ts>.
Phase 2 diagnosis posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] DevTools observations + SwitcherStateContext + mount + consumer refactor + sessionStorage decision
[Phase 2] DevTools observations per sub-bug + fix per sub-bug
[Phase 3] verification result OR fix

V.1-11 results:
1. <pass/fail>
... (all 11)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Out of scope this sprint (DO NOT touch)

1. **Delete artist** — Sprint 8.4 alongside logo upload, edit profile slide-over, workspace activity feed (Adam's 8.4 spec).
2. **Logo upload UI** — Sprint 8.4.
3. **Edit profile slide-over for `/artists/[id]`** — Sprint 8.4.
4. **Workspace activity feed** — Sprint 8.4.
5. **Phase 4 Operations migration** — explicitly excluded by Adam from 8.4 scope.
6. **TourWizard retirement** — separate sprint.
7. **Spotify search → genre extension** — separate sprint.
8. **AdvanceOverviewStatsStrip orphan deletion** — cleanup sprint.
9. **`<DangerConfirmModal>` primitive extraction** — Sprint 8.1 deferred.
10. **Per-user `tour_visits` table** — Sprint 8.2 deferred.
11. **Storage cleanup budget-files + advance-files (URL extraction)** — Sprint 8.2 deferred #5b.
12. **Migration 068 proper exemption for rental_jobs** — Sprint 8.2 deferred. Currently bypassed via `_lp_migrations` backfill row; cleanup sprint to write a real exemption migration.
13. **Status pill 10s autosave**, **custom field plus button**, **404 page CTAs**, **print button regression**, **5 baseline lint errors in ArtistTourContext**, **RoutingGrid pre-existing lint at line 137** — long-deferred items.

If you find another bug — note it in deferred. Don't fix.
