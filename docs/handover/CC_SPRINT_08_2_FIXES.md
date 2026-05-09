# CC Sprint 8.2 — Sprint 8.1 regressions + storage cleanup + post-delete polish

Seven fixes. Phase 2 is the only one that requires diagnosis-and-halt — the layout hoisting from 8.1 didn't actually fix the dropdown-closes-on-artist-switch bug, and CC needs to identify the actual remount cause via React DevTools before claiming a fix. Other phases ship continuously per the same authorization model as 8.1.

**Branch off `fix/sprint-8.1-fixes-plus`** (NOT main — 8.1 isn't merged yet; this stacks on top). Seven commits + V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_1_FIXES_PLUS.md` (context — Phase 2 layout hoisting and Phase 4 multi-step builder are the surfaces being patched)
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — Phase 1 + Phase 2 + Phase 3 target
- `src/components/shell-v2/ArtistTourSwitcherClientWrapper.tsx` — Phase 3 wrapper state target
- `src/components/shell-v2/tour-key-stat.ts` — Phase 1 deletion candidate
- `src/components/shell-v2/ProductShell.tsx` + `ProductHeader.tsx` — Phase 2 trace surface
- `src/app/(app)/artists/[id]/(home)/layout.tsx` and the three other Phase 8.1 layouts — Phase 2 trace surface
- `src/components/routing/RoutingGrid.tsx` — Phase 4 target; the `compact?` prop added in Sprint 8.1 §4 needs sub-bug fixes
- `src/components/shell-v2/TourCreateSlideOver.tsx` — Phase 4 host; check what props it passes to compact RoutingGrid
- `src/app/api/tours/[id]/route.ts` — Phase 5 storage cleanup target (DELETE handler)

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings.
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Seven commits in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7. One per phase.
7. Verify before claiming. Quote post-fix file:line.
8. **Phase 2 requires diagnosis-and-halt with React DevTools "Highlight Updates" trace BEFORE proposing a fix.** Sprint 8.1's layout hoisting was supposed to fix this and didn't. Don't assume what's wrong; trace what's actually happening. Post diagnosis with concrete observations (which component is unmounting + when + why), wait for sign-off.
9. **Phases 1, 3, 4, 5 ship continuously without sign-off gates.** Adam may be away. Make calls; document in the report.
10. **HALT criteria** (same as Sprint 8.1):
    - Irreversible data action you weren't authorized for.
    - Migration would conflict with existing data non-recoverably.
    - Phase 2 diagnosis comes back inconclusive — surface and wait for Adam.
    - Lint baseline would be exceeded.
    - Build doesn't compile after a phase.

---

## 2. Phase 1 — Remove key stat from switcher trigger (~20 min, mechanical)

### 2.1 Symptom

Adam: "PASS BUT the info is irrelevant. remove it."

The third dot-segment showing `67% SPENT` / `82% COMPLETE` / `12 CREW` is information overload in the trigger. Drop it.

### 2.2 Fix

In `src/components/shell-v2/ArtistTourSwitcher.tsx` trigger render block:
- Remove the third dot-segment for the key stat.
- Trigger goes back to `[avatar] Artist Name · Tour Name [chevron]` (single-row chip from Sprint 6.2 §3).

In `ProductShell.tsx`, `ProductHeader.tsx`, `ArtistTourSwitcherClientWrapper.tsx`, and `ArtistTourSwitcher.tsx` props:
- Drop the `currentTourKeyStat` prop / state plumbing introduced in Sprint 8.1 §1.

In `src/components/shell-v2/tour-key-stat.ts`:
- If the formatter is now used by NOTHING (Phase 2 layouts threaded it through; with this drop they shouldn't need it), delete the file.
- If something else uses it (verify with `grep -rn formatTourKeyStat src/`), keep the file but flag in deferred.

### 2.3 Acceptance

- [ ] Switcher trigger on `/budget/[X]`, `/advance/[X]`, `/operations/[X]` shows `[avatar] Artist · Tour [chevron]` only. NO third segment.
- [ ] No regression on `/artists/[id]` trigger (already had no key stat).
- [ ] Lint + typecheck clean.

### 2.4 Quote in report

- The deleted third-segment JSX block.
- The dropped prop chain (one line per file).
- Whether `tour-key-stat.ts` was deleted or kept (with reason).

### 2.5 Commit

`fix(shell-v2): drop key stat from switcher trigger (Sprint 8.2 §1)`

---

## 3. Phase 2 — Switcher dropdown closes on artist switch (DIAGNOSIS REQUIRED) (~90 min)

### 3.1 Symptom (Adam's verbatim)

> "dropdown closes once new artist selected. still no animation on the selector menu. when selecting an artist, it should stay open and let you then choose a tour, but it doesn't."

Sprint 8.1 §2 hoisted ProductShell + ProductHeader (containing the switcher wrapper) to per-product layouts. The hypothesis was that Next 16 preserves layout instances across `[id]` changes within the same route group, so the wrapper instance survives navigation from `/artists/[A]` to `/artists/[B]`, keeping `dropdownState='open'`.

That fix didn't take. Either:
- Next 16's layout-instance preservation doesn't work the way assumed
- The wrapper isn't actually inside the persisted layout boundary
- Something else (an effect, a key prop, a conditional render) forces remount on `[id]` change

### 3.2 Investigation step (post diagnosis to chat for sign-off)

**Required: React DevTools live trace.** Open the broken page on a local dev server (`npm run dev`) OR Vercel preview. Open DevTools → React DevTools → Components tab. Enable "Highlight updates when components render."

Do this exact flow and observe:
1. Open `/artists/[some-id]`.
2. Click the switcher trigger to open dropdown.
3. Wait for it to settle (no orange highlights).
4. Click an artist row to switch to a different artist.
5. Watch which components render orange. Which UNMOUNT (disappear and reappear)?

The goal: identify which component is actually re-mounting on `[id]` change. Likely candidates:
- `ArtistTourSwitcher` (the trigger + dropdown component itself)
- `ArtistTourSwitcherClientWrapper` (the state-holding parent)
- `ProductHeader` (the server component)
- `ProductShell` (the layout root)
- The route group layout itself

If the layout IS persisting but the wrapper is INSIDE a part of the layout that re-renders with `key={pathname}` or similar — that's the bug. Trace the JSX from layout.tsx down to the wrapper render and identify any explicit `key=`, conditional render, or `useEffect` that depends on params.

Also check: does `ArtistTourProvider` (the context provider) re-mount? If yes, the wrapper would re-mount along with it.

**Diagnosis post format:**

```
Phase 2 diagnosis:
- Trace observation: <which component(s) unmount/remount on [id] change>
- Root cause: <one paragraph — why the layout-instance preservation isn't holding>
- Fix scope: <what specifically changes>
- Confidence: <high/medium/low>
- If low: what additional info would make confidence high?
```

Wait for Adam's sign-off.

### 3.3 Fix scope (subject to diagnosis)

Likely candidates (in order of probability):
- **A.** A `key={params.id}` somewhere in the layout chain forces remount. Remove it.
- **B.** The wrapper is INSIDE a server component that re-runs with new params, dropping its children's state. Restructure to put the wrapper higher.
- **C.** `ArtistTourProvider` re-mounts because it's mounted per-page, not per-layout. Hoist it to a workspace-level layout (or root layout) so its children's state survives.
- **D.** Next 16 quirk where same-route navigation IS treated as full remount. Workaround: persist dropdown state in URL (`?picker=tours&picker_artist=X`) so it survives remount.

Pick whichever the diagnosis confirms. (D is the fallback if A/B/C all fail to apply.)

### 3.4 Acceptance

- [ ] On `/artists/[A]`, click artist B in switcher → dropdown stays open, transitions to B's tours pane.
- [ ] User can then click a tour → navigates correctly.
- [ ] Browser back/fwd regression: dropdown stays closed on back/fwd nav (Sprint 7 §1.A check).
- [ ] No regressions in tour-side navigation (e.g. `/budget/[A]` → pick tour B in switcher → URL changes, dropdown behavior preserved).
- [ ] Lint + typecheck clean.

### 3.5 Quote in report

- Diagnosis sign-off timestamp.
- Trace observations (verbatim).
- The post-fix change (file:line + before/after).

### 3.6 Commit

`fix(shell-v2): switcher dropdown persists across same-product nav (Sprint 8.2 §2 — re-fix of 8.1 layout hoisting)`

---

## 4. Phase 3 — New artist not in switcher (~30 min, likely linked to Phase 2)

### 4.1 Symptom (Adam's verbatim)

> "added new artist, on their home page, but not seeing them in the selector."

Created via `+ NEW ARTIST` slide-over → artist created server-side → page navigates to `/artists/[new-id]` → switcher's artists pane doesn't include the new artist.

### 4.2 Hypothesis

The wrapper's `createdArtists` local state holds the optimistic prepend from `handleArtistCreated`. After navigation to `/artists/[new-id]`, if Phase 2's wrapper-remount-on-nav bug is real, `createdArtists` is reset to `[]` and the new artist depends entirely on `initialArtists` from server fetch. Server fetch happens at layout level — IF the layout re-fetches on `[id]` change, the new artist would appear from that fetch (assuming the database transaction has committed).

If Phase 2's fix lands, the wrapper instance survives → `createdArtists` persists → new artist is visible.

### 4.3 Fix (subject to Phase 2's outcome)

Two paths:

**(A)** If Phase 2 fixes the wrapper remount, this might auto-resolve. Verify on smoke. If it does, just confirm in this commit's report and ship a no-op or a small regression test addition.

**(B)** If Phase 2's fix is deferred (e.g. URL-state workaround) or doesn't resolve this, force the issue: add an explicit refresh on artist creation success. After `handleArtistCreated`'s optimistic prepend + `router.push('/artists/[new-id]')`, also call `router.refresh()` so the layout re-fetches `initialArtists` server-side.

Pick whichever path the Phase 2 diagnosis suggests.

### 4.4 Acceptance

- [ ] Create new artist via slide-over → page navigates to `/artists/[new-id]` → open switcher → artists pane includes the new artist (top of list, since optimistic prepend is at top).
- [ ] No regression: existing artists still visible.
- [ ] Lint + typecheck clean.

### 4.5 Commit

`fix(shell-v2): new artist appears in switcher post-create (Sprint 8.2 §3)`

---

## 5. Phase 4 — RoutingGrid compact mode bugs (~75 min, multi-bug)

### 5.1 Symptoms (Adam's verbatim)

> "the day type drop down is empty, when i type a location, the first line of the address (usually the name of the place) goes in location, the address fills in the address column. but once address is filled, I can edit the location title and unless I select from the drop down, the address shouldnt change. drop down address picker is also not visible. travel time doesnt show up and calculate."

Four sub-bugs:

**4a — Day type dropdown is empty.** The `<select>` for day_type in compact mode renders but has no options visible. Possible causes:
- The compact prop accidentally hides options
- The options array isn't passed in compact mode
- Day-type CSS in compact mode collapses the dropdown height
- A CSS rule on slide-over context (`overflow: hidden` on parent) clips the dropdown

**4b — Drop-down address picker not visible.** When user types in the location autocomplete, the Google Places dropdown of suggestions doesn't appear. Likely:
- Slide-over has `overflow: hidden` clipping the absolute-positioned suggestions list
- z-index conflict between SlideOver and PlaceAutocomplete dropdown
- The dropdown renders but is positioned off-screen

**4c — Drive time not showing/calculating.** The inter-row drive-time band doesn't appear. Likely:
- `useGoogleDrive` flag not enabled in compact mode
- Lat/lng not being populated from autocomplete (so the drive-time fetch can't fire)
- The drive-time UI is conditionally hidden in compact mode

**4d — Editing location after address-fill overrides address.** UX expectation: once a Google Place is picked, the address column is filled. If the user edits the location text manually (not picking from autocomplete), the address should NOT change. Current behavior: the address syncs back to the location text.

### 5.2 Investigation + fix scope

For each sub-bug, read the existing RoutingGrid component to identify:

**4a:** Find the day_type `<select>` render. Compare what it renders in compact vs non-compact. The DAY_TYPES array (or equivalent) must populate the same `<option>` list in both modes.

**4b:** PlaceAutocomplete component: where does its dropdown render? If it's a child of the slide-over panel which has `overflow: hidden`, lift the dropdown to a portal (e.g. `document.body`) so it's not clipped. Verify z-index puts it above SlideOver content.

**4c:** `useGoogleDrive` should fire when consecutive rows have `latitude` AND `longitude` AND day_type !== 'travel'/'off'. Verify:
- Place selection populates `latitude` and `longitude` columns (RoutingGrid passes these in `onPlaceSelect`)
- Drive-time fetch fires with both rows' coords
- Drive-time UI element is rendered in compact mode (not hidden)

**4d:** The PlaceAutocomplete's `onChange` (raw text input) should NOT update the address column. Only `onPlaceSelect` (picking from dropdown) should update both location AND address. This is a state-management split. Verify the input's `value` and the address column's `value` are independent state branches; only `onPlaceSelect` writes both.

### 5.3 Acceptance

- [ ] Day_type dropdown shows the schema's enum values (Show / Travel / Day off / Press / Hold) when clicked.
- [ ] Type in location field → Google Places suggestions dropdown is visible (not clipped, not z-index'd below).
- [ ] Pick a Place → location, address, lat/lng, city, country, capacity (if available) all fill.
- [ ] Edit location text manually after fill → address stays unchanged.
- [ ] Two consecutive show rows with coords → drive time band visible between them with calculated hours.
- [ ] Travel/off day_type → drive time band hidden between (matches non-compact behavior).
- [ ] Lint + typecheck clean.

### 5.4 Quote in report

- Each sub-bug fix's before/after.
- Confirmation that the `compact` prop's net effect is now `{className tightening, column rename}` only, NOT functional behavior changes.

### 5.5 Commit

`fix(shell-v2): RoutingGrid compact mode bugs — day type, picker visibility, drive time, edit-doesn't-override (Sprint 8.2 §4)`

---

## 6. Phase 5 — Storage orphan cleanup (~45 min)

### 6.1 Background (Sprint 8.1 §5 deferred)

When a tour is deleted, the DB cascades all 22 tour-scoped tables. But Supabase Storage objects (rider-asset files) DON'T cascade — they orphan in the bucket. CC flagged this as half-day follow-up; this phase is that follow-up.

### 6.2 Fix scope

In `src/app/api/tours/[id]/route.ts` (the DELETE handler):

Before the DB DELETE:

1. Enumerate `rider_assets.storage_path` values for the tour:
   ```sql
   SELECT storage_path
   FROM rider_assets
   WHERE tour_id = $1
   ```
2. Call `supabase.storage.from('rider-assets').remove([...paths])`. Tolerate failure — log but don't roll back.

After storage cleanup, proceed with the DB DELETE as today.

If other buckets also hold tour-scoped files (e.g. `tour-files`, `advance-files`), enumerate those too. Find all buckets that might hold tour-scoped data:

```bash
grep -rn "storage.from\|bucket(" src/ | grep -v test
```

Document which buckets' files get cleaned.

### 6.3 Acceptance

- [ ] DELETE `/api/tours/[id]` enumerates `rider_assets` rows by tour_id and removes those paths from `rider-assets` bucket BEFORE the DB delete.
- [ ] If other tour-scoped buckets exist, they're cleaned too.
- [ ] DB delete still succeeds (or surfaces an error) regardless of storage cleanup outcome.
- [ ] Toast on success, navigation away from deleted tour's URL — preserved from Sprint 8.1.
- [ ] Lint + typecheck clean.

### 6.4 Quote in report

- The pre-DB-delete enumeration + storage.remove call.
- A list of buckets that get cleaned (verifies the audit happened).

### 6.5 Commit

`feat(api): tour delete cleans storage objects before DB delete (Sprint 8.2 §5 — closes 8.1 deferred #1)`

---

## 7. Phase 6 — Pick Up Where You Left Off accuracy + deleted-tour stale (~45 min)

### 7.1 Symptoms (Adam's verbatim)

> "the 'pick up where you left off' menu isnt accurate to the last thing I worked on. and it should be. it's also currently showing a tour i just deleted still."

Two problems:

**6a — Stale "deleted tour" appears.** After deleting a tour, the workspace landing's Pick Up card still shows it. Either:
- Server-render cache on `/artists` not invalidated after delete
- The most-recently-updated query is hitting cached data
- The Pick Up component reads from a stale source

**6b — "Last thing I worked on" inaccuracy.** Sprint 7 §6.2 used the most-recently-`updated_at` tour as a fallback, not actual user-touched tracking. So Pick Up shows whatever was last edited in the workspace, not what THIS user opened/edited last.

### 7.2 Fix scope

**6a — Cache invalidation:**

After Phase 5 of Sprint 8.1 (tour delete), the workspace landing isn't told to revalidate. In the DELETE `/api/tours/[id]/route.ts` handler (or the client-side flow that calls it), add:

```ts
// After successful DB delete:
revalidatePath('/artists');
revalidatePath(`/artists/${artistId}`);
```

OR, on the client side in the tour delete confirmation modal's success handler:

```ts
router.refresh();
```

Both work. Pick whichever fits the architecture.

**6b — Better "last thing" tracking:**

Two options:

**(A)** Add a lightweight tracking column. `tours.last_visited_at` (server-side updated on each page load via a tiny effect) + `tours.last_visited_by_user_id`. Per-user tracking via a `tour_visits` join table is more accurate but more schema. Single `last_visited_at` is simpler, reflects "anyone in workspace touched this tour."

**(B)** Add real per-user audit logging. New table `tour_visits` (user_id, tour_id, last_visited_at). Update on every product page load via an API call. Pick Up query joins on this table filtered by current user.

**(C)** Don't track separately. Use a heuristic: pick the most-recently-updated tour the current user has touched (via budget edits, advance edits, etc — query an existing audit-log if one exists; fall back to `tours.updated_at`).

Pick (A) for v1 — simplest, gets meaningfully better than the current "any workspace member's last edit." If Adam wants per-user precision later, it migrates cleanly to (B).

If implementing (A):
- Migration: `ALTER TABLE tours ADD COLUMN last_visited_at TIMESTAMPTZ;`
- Update on each `/budget/[tourId]/*`, `/advance/[tourId]/*`, `/operations/[tourId]/*` page load via a tiny client effect that POSTs `/api/tours/[id]/touch` (sets `last_visited_at = now()`).
- Pick Up query orders by `last_visited_at DESC NULLS LAST`, falls back to `updated_at` for tours never visited.

### 7.3 Acceptance

- [ ] Delete a tour → workspace landing's Pick Up card no longer shows it (refreshes within ~1 second of delete or on next nav).
- [ ] Visit a tour's product page (e.g. `/budget/[tourId]`) → Pick Up card on next visit to `/artists` shows that tour.
- [ ] If user has never visited any tour: Pick Up falls back to most-recently-updated tour (current behavior).
- [ ] If user has visited multiple tours, the MOST-recently-visited shows up.
- [ ] Lint + typecheck clean.

### 7.4 Quote in report

- The cache invalidation call (revalidatePath OR router.refresh).
- The migration adding `last_visited_at`.
- The `/api/tours/[id]/touch` endpoint.
- The client-side touch effect (probably in TourHeader or layout).
- The updated Pick Up query.

### 7.5 Commit

`feat(home,api): Pick Up Where You Left Off — last_visited_at tracking + cache invalidation (Sprint 8.2 §6)`

---

## 8. Phase 7 — Name capitalization on workspace landing (~10 min, mechanical)

### 8.1 Symptom (Adam's verbatim)

> "Also my name isnt capitalised on this screen."

Likely the name display is rendering raw from the DB (e.g. "adam growley") without title-case formatting OR the user's display name in profiles is stored without capitalization.

### 8.2 Investigation step

Find where the user's name renders on the workspace landing. Likely candidates:
- WorkspaceTopBar avatar display
- Pick Up card "Welcome back" line if present
- Any other personalization line

Check whether:
- The name is rendered raw from `profiles.full_name`
- A formatter exists somewhere that should capitalize but doesn't apply here

### 8.3 Fix scope

Two options:

**(A)** CSS-only fix: add `text-transform: capitalize` to the rendering element. Title-cases each word. Won't fix data underneath but visually solves it. Cheap.

**(B)** JS title-case on render: a small `titleCase(name)` helper that splits on spaces, capitalizes each word's first letter. Doesn't mutate stored data.

**(C)** Mutate stored data: update `profiles.full_name` for users who have lowercase. Probably overkill; data-side fix that doesn't help future users with the same issue.

Pick **A or B**. A is lighter; B handles edge cases (e.g. all-caps "ADAM GROWLEY" → "Adam Growley"). If A's `text-transform: capitalize` produces the right result for typical names, ship A.

### 8.4 Acceptance

- [ ] Workspace landing display of user name is properly capitalized.
- [ ] No regression on profile page or other surfaces where name renders.
- [ ] Lint + typecheck clean.

### 8.5 Quote in report

- The CSS or JS change.

### 8.6 Commit

`fix(home): capitalize user name on workspace landing (Sprint 8.2 §7)`

---

## V. Verify (~30 min)

CC: walk these on the Vercel preview after all five phases land.

1. Phase 1 — switcher trigger shows `[avatar] Artist · Tour [chevron]` only on tour-scoped pages. NO third dot-segment. PASS / FAIL.
2. Phase 2 — `/artists/[A]` → click artist B in switcher → dropdown stays open, smoothly transitions to B's tours pane. NO close. PASS / FAIL.
3. Phase 3 — create new artist via slide-over → page navigates → open switcher → new artist appears at top of artists list. PASS / FAIL.
4. Phase 4a — RoutingGrid in TourCreateSlideOver page 2 → click a day_type dropdown → options visible (Show / Travel / Day off / Press / Hold). PASS / FAIL.
5. Phase 4b — RoutingGrid in slide-over → type a venue name → Google suggestions dropdown is visible (not clipped). PASS / FAIL.
6. Phase 4c — fill two consecutive show rows with venues → drive time band appears between them with calculated hours. PASS / FAIL.
7. Phase 4d — pick a Place → both location and address fill → manually edit the location text → address stays unchanged. PASS / FAIL.
8. Phase 5 — delete a tour with rider-asset files attached → check Supabase Storage `rider-assets` bucket → those files are removed. PASS / FAIL (Adam may need to verify in Supabase UI).
9. Phase 6 — delete a tour, then visit `/artists` → Pick Up card no longer shows the deleted tour. PASS / FAIL.
10. Phase 6 — visit `/budget/[X]` for tour A, then `/budget/[Y]` for tour B, then visit `/artists` → Pick Up shows tour B (most recently visited). PASS / FAIL.
11. Phase 7 — workspace landing user name renders properly capitalized. PASS / FAIL.
12. `prefers-reduced-motion: reduce` → all animations collapse to instant. PASS / FAIL.
13. Console clean.
14. Lint baseline 75/120. Typecheck zero. `next build --webpack` succeeds.

If 2 or 4-7 fail, halt and surface to Adam.

---

## When done — report exactly this format

```
Sprint 8.2 done. Branch: fix/sprint-8.2-fixes (off Sprint 8.1 branch)
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2): drop key stat from switcher trigger
- 2: <hash> fix(shell-v2): switcher dropdown persists across same-product nav
- 3: <hash> fix(shell-v2): new artist appears in switcher post-create
- 4: <hash> fix(shell-v2): RoutingGrid compact mode bugs
- 5: <hash> feat(api): tour delete cleans storage objects
- 6: <hash> feat(home,api): Pick Up Where You Left Off accuracy + cache invalidation
- 7: <hash> fix(home): capitalize user name on workspace landing

Phase 2 diagnosis posted at <ts>, signed off at <ts>.

Quoted post-fix lines:
[Phase 1] deleted third-segment + dropped prop chain
[Phase 2] trace observations + root cause + post-fix change
[Phase 3] new-artist propagation logic
[Phase 4] each sub-bug fix
[Phase 5] storage cleanup pre-DB-delete
[Phase 6] cache invalidation + last_visited_at migration + touch endpoint + Pick Up query
[Phase 7] capitalize fix

V.1-14 results:
1. <pass/fail>
... (all 14)

Lint <X errors / Y warnings>. Typecheck zero. Build OK.
```

---

## Adam's separate verification (no CC work — for Adam's smoke)

For Sprint 8.1 §5 acceptance verification (Adam couldn't confirm cascade fired in Supabase): run these queries in Supabase SQL Editor on a tour you don't mind losing:

```sql
-- Pick a test tour ID
SET LOCAL my.tour_id = '<tour-uuid-here>';

-- Counts before delete
SELECT 'routing' AS table_name, count(*) FROM routing WHERE tour_id = current_setting('my.tour_id')::uuid
UNION ALL SELECT 'budget_line_items', count(*) FROM budget_line_items WHERE tour_id = current_setting('my.tour_id')::uuid
UNION ALL SELECT 'tour_personnel', count(*) FROM tour_personnel WHERE tour_id = current_setting('my.tour_id')::uuid
UNION ALL SELECT 'flights', count(*) FROM flights WHERE tour_id = current_setting('my.tour_id')::uuid
UNION ALL SELECT 'hotels', count(*) FROM hotels WHERE tour_id = current_setting('my.tour_id')::uuid
UNION ALL SELECT 'tour_gear', count(*) FROM tour_gear WHERE tour_id = current_setting('my.tour_id')::uuid;

-- Now delete the tour via the app's UI

-- Counts after delete (should all be zero):
[same query as above]

-- Bucket check (in Supabase Storage UI):
-- Navigate to rider-assets bucket. Look for the tour's folder/files.
-- Pre-Sprint-8.2 phase 5: files persist (orphan).
-- Post-Sprint-8.2 phase 5: files removed.
```

Run pre-merge to confirm cascade. If any non-zero counts remain after delete, surface — that's a cascade gap.

---

## Out of scope this sprint (DO NOT touch)

1. Spotify search → genre extension.
2. AdvanceOverviewStatsStrip orphan file deletion.
3. TourWizard retirement.
4. Edit profile slide-over for `/artists/[id]`.
5. Logo upload UI.
6. Workspace activity feed.
7. Phase 4 Operations migration (Personnel / Channel List / Payroll / Rooming / Files placeholders).
8. Status pill 10s + page reload autosave.
9. Custom field plus button broken.
10. 404 pages have no return-to-home button.
11. Print button regression.
12. Five baseline `react-hooks/set-state-in-effect` errors in ArtistTourContext.
13. RoutingGrid pre-existing lint at line 137 (Sprint 8.1 deferred #2).
14. `<DangerConfirmModal>` primitive extraction (Sprint 8.1 deferred #6).

If you find another bug — note it in deferred. Don't fix.
