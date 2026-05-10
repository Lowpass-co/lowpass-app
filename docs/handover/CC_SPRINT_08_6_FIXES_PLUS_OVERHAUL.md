# CC Sprint 8.6 — Sprint 8.5 fixes + advance template overhaul

Six phases. Four fixes that 8.5 didn't fully close, plus two heavy features Adam's flagged repeatedly: Key Contacts consolidation and custom fields on pre-existing headers.

**Branch off `fix/sprint-8.5-fixes`** (NOT main; stacks on top). Six commits + V verify.

---

## 0. Required reading

- `CLAUDE.md`
- `docs/handover/CC_SPRINT_08_5_FIXES.md` (context — switcher hoist + autocomplete fix + advance library rebuild)
- `src/components/shell-v2/ArtistTourSwitcher.tsx` — Phase 1 + Phase 2 target
- `src/components/layout/AppShell.tsx` — Phase 1 mount inspection
- `src/components/routing/VenueAutocomplete.tsx` — Phase 3 target
- `src/components/advance/AdvanceSectionBuilder.tsx` — Phase 4 + 5 + 6 target
- `src/components/advance/AdvanceShowReadView.tsx` — Phase 5 read-side updates
- `src/app/api/advance/templates/route.ts` — Phase 6 target (workspace template fork logic)
- `database/migrations/` — Phase 5 needs a contact-fields migration

---

## 1. Hard rules

1. No new dependencies.
2. No `any`, no `// @ts-ignore`.
3. Lint baseline 75 errors / 120 warnings (8.5 ended at 70/120 — try to stay there).
4. Typecheck zero.
5. Build via `next build --webpack` only.
6. Six commits in numeric order: 1 → 2 → 3 → 4 → 5 → 6.
7. Verify before claiming. Quote post-fix file:line.
8. **Phases 1, 3, 4 require diagnosis-and-halt** — runtime React DevTools / Network / DOM inspection. Static guesses haven't worked for these.
9. **Phase 5 requires migration design sign-off** — moving existing contact field instances to a new Key Contacts section is a destructive-ish data migration. Diagnosis must spell out exactly what data moves and what existing tours look like before/after.
10. **Phase 6 requires UX mockup sign-off** — the workspace template fork behavior needs to be visually clear to users.
11. **Phase 2 ships continuously** — mechanical `min-height: 0` flex fix.
12. Halt criteria same as 8.5: data corruption, build break, lint exceeded, structural assumption wrong.

---

## 2. Phase 1 — Switcher residual close+reopen flash (~45 min, diagnosis required)

### 2.1 Symptom

Adam: "Kinda pass? It closes, reopens, then the artist page changes and it stays open."

Sprint 8.5 §1 hoisted the switcher to AppShell — the dropdown SHOULD survive navigation now. It does (eventually). But there's still a visible close+reopen flash between click and page transition.

### 2.2 Investigation step (post diagnosis to chat for sign-off)

Run locally with React DevTools "Highlight Updates":

1. Open switcher on `/artists/[A]`.
2. Click artist B in the artists pane.
3. Watch React DevTools — what re-renders, in what order?
4. Watch the DOM for the switcher panel — does its `data-state` attribute briefly flip to `'closed'` then back to `'open'`?
5. Check `handleArtistClick` in `ArtistTourSwitcher.tsx` — does it call `setDropdownState('closed')` anywhere? Does `transitionToPane` briefly clear?

Most likely candidates:
- **A.** `handleArtistClick` calls `closeDropdown()` or `setDropdownState('closed')` before `router.push`, then on the new mount, sessionStorage restores 'open'.
- **B.** The `transitionToPane('tours', 'forward')` setter sequence briefly causes a state flicker visible in CSS.
- **C.** The cross-product close `useEffect` (Sprint 8.3 §3) is firing on `useProductContext()` change DURING the navigation, briefly closing before the state settles.
- **D.** Some other useEffect closes on a transient state.

**Diagnosis post:**

```
Phase 1 diagnosis:
- Component re-render order (DevTools): <list>
- data-state transitions observed: <sequence>
- Root cause: <one paragraph>
- Fix scope: <what changes>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 2.3 Fix scope (subject to diagnosis)

Targeted to actual cause. Likely options:
- Remove a stray `setDropdownState('closed')` call.
- Add a guard that ignores cross-product close while a same-product transition is in flight.
- Sequence state setters so dropdown stays 'open' through the transition.

### 2.4 Acceptance

- [ ] Click an artist on `/artists/[A]` → dropdown stays visually open through navigation. NO close+reopen flash. Smooth pane transition to tours.
- [ ] Cross-product nav (`/artists` → `/budget`) still closes dropdown (Sprint 8.3 §3 regression check).
- [ ] Browser back/fwd still closes dropdown (Sprint 7 §1.A regression check).
- [ ] Lint + typecheck clean.

### 2.5 Quote in report

- Diagnosis sign-off timestamp.
- DevTools observations.
- Post-fix change.

### 2.6 Commit

`fix(shell-v2): close switcher residual flash on same-product nav (Sprint 8.6 §1)`

---

## 3. Phase 2 — Dropdown scroll fall-through (~20 min, mechanical)

### 3.1 Symptom

Adam: "scrolls the main page, not the picker."

The dropdown's scrollable area scrolls the page underneath instead of the dropdown content. Sprint 8.5 §2 added `overflow-y: auto` on the inner div but missed the flex sizing constraints.

### 3.2 Fix

In `ArtistTourSwitcher.tsx` ArtistsPane and ToursPane:

The scrollable div needs `min-height: 0` (or `min-block-size: 0`) to actually scroll inside a flex parent. Without it, the flex child grows to its natural content height, never triggering overflow.

Verify the parent panel has `display: flex; flex-direction: column;` AND a `max-height` set. Then the scrollable child gets:

```ts
style={{
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,  // critical
  // ... existing styles
}}
```

Also: the panel ITSELF (`.lp-ats-panel`) needs `overflow: hidden` so its children's overflow doesn't escape.

### 3.3 Acceptance

- [ ] Open switcher with 12+ artists → scroll inside the dropdown — only the dropdown content scrolls, NOT the page underneath.
- [ ] Same on tours pane.
- [ ] Create CTA stays sticky at bottom regardless of scroll position.
- [ ] Lint + typecheck clean.

### 3.4 Quote in report

- The post-fix flex/overflow values on the panel and inner scrollable div.

### 3.5 Commit

`fix(shell-v2): switcher dropdown scrolls inside panel, not page (Sprint 8.6 §2)`

---

## 4. Phase 3 — Location autocomplete address fill (~60 min, diagnosis required)

### 4.1 Symptom (Adam clarified — Q1 = A)

Click a Google Places suggestion → location field fills with venue name → address column STAYS EMPTY.

Sprint 8.5 §3 shipped three defensive fixes (drop redundant onChange + isPickingRef + 503 toast). Apparently none of them addressed the actual bug, OR a new code path was introduced that breaks differently.

### 4.2 Investigation step (post diagnosis to chat)

Run locally:

1. Open TourCreateSlideOver page 2.
2. Open DevTools Network tab.
3. Type a venue name in a location cell.
4. Watch network requests:
   - Does `/api/places/autocomplete` fire? Response status?
   - Click a suggestion. Does `/api/places/details?placeId=...` fire? Response status? What's the response body?
5. Watch console for errors.
6. Inspect the row in React DevTools after click: what's `address` set to in the row's state?

Possible causes (ranked):
- **A.** `/api/places/details` returns 503 (missing GOOGLE_PLACES_API_KEY) — `handleSelect`'s failure path doesn't fill address. Sprint 8.5 §3 added a toast for this; verify it's appearing. If yes, env var is missing on Vercel. If no, the toast logic isn't firing because the response shape differs.
- **B.** `/api/places/details` returns 200 with formattedAddress, but the parent's `onPlaceSelect` handler doesn't write to the `address` column. Bug is in RoutingGrid's handler, not VenueAutocomplete.
- **C.** `onPlaceSelect` writes correctly but a downstream effect overwrites address (e.g. a useEffect watching venue_name resets address).
- **D.** Some change in 8.5 broke the onPlaceSelect prop passing chain — wire-up error in TourCreateSlideOver page 2 hookup.

**Diagnosis post:**

```
Phase 3 diagnosis:
- /api/places/autocomplete: <status, response>
- /api/places/details: <status, response, body shape>
- Parent's onPlaceSelect handler trace: <does it run? does it set address?>
- Row state after click: <address value, expected vs actual>
- Root cause: <one paragraph>
- Fix scope: <what changes>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 4.3 Fix (subject to diagnosis)

Targeted to actual cause.

If env var missing: surface a clear setup error, instruct Adam to set GOOGLE_PLACES_API_KEY. (Code can't fix this; UX of failure can.)

If parent handler bug: fix the row-state writeback in RoutingGrid or its parent.

If downstream overwrite: identify the offending effect and remove the address reset.

### 4.4 Acceptance

- [ ] Type a venue → suggestions appear.
- [ ] Click suggestion → location AND address both populate.
- [ ] Edit location text manually + tab away → address stays unchanged (Sprint 8.5 §3 regression check).
- [ ] If GOOGLE_PLACES_API_KEY missing, user sees a clear toast (not silent failure).
- [ ] Lint + typecheck clean.

### 4.5 Quote in report

- Diagnosis sign-off timestamp.
- Network/DevTools observations.
- Post-fix change.

### 4.6 Commit

`fix(routing): address column fills on autocomplete pick (Sprint 8.6 §3)`

---

## 5. Phase 4 — Drag reorder persistence (~60 min, diagnosis required)

### 5.1 Symptom

Adam: "fields dont re-order. when dragging a header over a header they both flash and glitch until I release, but also dont re-order."

Sprint 8.5 §6c added an autosave effect with 800ms debounce. Apparently:
- Either the autosave fires but the new order doesn't actually change in local state
- Or local state changes but the autosave isn't firing
- Or autosave fires but the API doesn't accept the new order

The "flash and glitch" suggests drag preview interferes with the underlying DOM in a way that confuses React.

### 5.2 Investigation step (post diagnosis to chat)

Run locally:

1. Open advance template builder.
2. Open DevTools Console + Network tab.
3. Try to drag a section header to a new position.
4. During drag: watch what re-renders, what classes/data-state attrs change on the dragged item and target.
5. After drop: 
   - Console: any errors?
   - Network: does `POST /api/tours/[id]/advance` fire? Body?
   - React DevTools: what's the `sections` array after drop? Order matches the drop OR reverted?
6. Reload the page: does the new order persist?

Possible causes:
- **A.** `moveSectionOrder` updates state but a re-render reverts because parent prop overrides local state.
- **B.** Drag handler calls `setDragState(null)` BEFORE the move, causing the drop position calculation to be wrong.
- **C.** Autosave fires but the POST returns 200 without actually updating DB (server bug).
- **D.** Autosave check `current === lastSavedSectionsRef.current` evaluates equal because of stable JSON ordering — order changes but stringify produces same output (extremely unlikely, but possible if stringify is deterministic).
- **E.** The drag visual feedback's `:hover` / `:active` state interferes with click detection.

**Diagnosis post:**

```
Phase 4 diagnosis:
- During-drag state transitions: <list>
- After-drop sections array: <verbatim>
- POST /api/tours/[id]/advance: <fired? body? status?>
- After-reload sections: <persists or reverts?>
- Root cause: <one paragraph>
- Fix scope: <what changes>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 5.3 Fix (subject to diagnosis)

Likely options:
- Reorder the state setters to avoid the revert.
- Fix the autosave dirty-detection.
- Fix the API endpoint if it's not actually persisting.

### 5.4 Acceptance

- [ ] Drag a section to a new position → sections array reflects new order in DevTools.
- [ ] Wait 1 second → POST fires.
- [ ] Reload page → new order persists.
- [ ] Field reorder within a section also persists (similar pattern).
- [ ] Manual Save Layout button still works (regression check).
- [ ] Lint + typecheck clean.

### 5.5 Quote in report

- Diagnosis sign-off timestamp.
- Observations.
- Post-fix change.

### 5.6 Commit

`fix(advance): section + field drag reorder persists (Sprint 8.6 §4)`

---

## 6. Phase 5 — Key Contacts consolidation (~3 hr, migration sign-off required)

### 6.1 Goal (Adam clarified — Q2 = B, consolidation)

> "I've mentioned about 4900 times that there should be a 'key contacts' header and ALL contacts should live there, not within the other headers."

Schema migration moves all existing contact-type field instances to a dedicated "Key Contacts" section. Contact fields ONLY allowed in Key Contacts going forward. Other sections lose their contact fields.

### 6.2 Migration design (post diagnosis for sign-off)

Audit needed:
1. How are contacts currently structured? Is "contact" a field type, or is it a section name like "Hospitality contact"?
2. Where do contact fields live in the data model? Per-section in `advance.data` JSONB? In a separate table?
3. Does a "Key Contacts" section template exist in the platform templates, or do we need to create one?

Then draft the migration:

```sql
-- Sketch:
-- 1. Ensure platform "Key Contacts" template exists with appropriate fields
-- 2. For each advance_instance with contact fields scattered in other sections:
--    - Extract contact field values from each section
--    - Insert them into Key Contacts section
--    - Remove from original sections
-- 3. Update template definitions: remove "contact" type from non-Key-Contacts templates
```

**Diagnosis post:**

```
Phase 5 migration design:
- Contact field current location: <data model>
- Existing Key Contacts template: <exists/needs creation>
- Migration steps: <verbatim plan>
- Existing tour count to migrate: <approximate>
- Reversibility: <down-migration possible? data loss risk?>
- Confidence: <high/medium/low>
```

Wait for Adam's sign-off.

### 6.3 Implementation scope

After sign-off:

**Schema migration:**
- Migration `NNN_advance_key_contacts_consolidation.sql` — creates Key Contacts template if missing, migrates existing data.
- Idempotent. Re-runnable.

**Template library:**
- Mark "contact" field type as restricted-to-Key-Contacts in field type registry.
- Other section templates lose contact fields (kept as legacy data but not added to new sections).

**Builder UI:**
- "Add custom field" type picker excludes "contact" UNLESS adding to Key Contacts section.
- Visual divider in library between Key Contacts (always at top) and other sections.

**Read view:**
- Key Contacts section auto-pinned to top of every advance.
- Visual distinction (maybe a different background or accent border).

### 6.4 Acceptance

- [ ] Existing tours: contact fields moved to Key Contacts section. Original sections no longer show those contacts.
- [ ] New tours: Key Contacts section auto-included on creation.
- [ ] Builder: can't add contact field type to non-Key-Contacts sections.
- [ ] Read view: Key Contacts pinned to top.
- [ ] Migration applied cleanly via `npm run db:migrate`.
- [ ] No data loss for any existing contact field value.
- [ ] Lint + typecheck clean.

### 6.5 Quote in report

- Migration sign-off timestamp.
- Migration file (full content).
- Builder restriction code.
- Read view pin logic.

### 6.6 Commit

`feat(advance,db): Key Contacts consolidation — migration + UI restrictions (Sprint 8.6 §5)`

---

## 7. Phase 6 — Custom fields on pre-existing headers (~2.5 hr, mockup sign-off required)

### 7.1 Goal (Adam clarified — Q3)

> "needs to be added to the headers library for all future tours NOT tour specific. User specific (workspace)"

When user adds a custom field to a section in the canvas, the field is added to the workspace's version of that section template. Future tours in this workspace inherit the customization.

Implementation: workspace template "fork" — when adding to a platform template, fork it into a workspace template with the custom field added.

### 7.2 Mockup (post for sign-off)

Within a section in the builder canvas:

```
┌────────────────────────────────────────────────┐
│ ▾ HOSPITALITY                            [×]   │
├────────────────────────────────────────────────┤
│   Catering preferences                          │
│   Dressing rooms                                │
│   Stage door pin                                │
│   ... (existing fields)                         │
│                                                  │
│   [+ Add custom field]                          │ ← NEW
└────────────────────────────────────────────────┘

Click [+ Add custom field] opens an inline form OR small modal:

┌────────────────────────────────────────┐
│ ADD FIELD TO HOSPITALITY                │
├────────────────────────────────────────┤
│ Field label *                           │
│ [text input]                            │
│                                          │
│ Field type *                             │
│ ( ) Text   ( ) Number   ( ) Checkbox    │
│ ( ) Dropdown   ( ) Date   ( ) File       │
│                                          │
│ Required field?  [✓]                    │
│                                          │
│ ⚠ This field will appear on ALL         │
│   Hospitality sections in this workspace,│
│   including future tours.                │
├────────────────────────────────────────┤
│              [Cancel]  [Add field]      │
└────────────────────────────────────────┘
```

### 7.3 Implementation

**API: workspace template fork:**

`POST /api/advance/templates/[id]/fork-add-field` (or similar)
- Takes platform template_id + new field definition.
- Server-side:
  1. Check if workspace already has a custom template for this platform template (by name match OR a `forked_from_id` column if added).
  2. If yes: append field to existing workspace template.
  3. If no: create new workspace template (copy fields from platform, add new field). Set `forked_from_id` to original.
- Returns new/updated workspace template.

**Schema additions:**
- `advance_templates.forked_from_id UUID NULL REFERENCES advance_templates(id) ON DELETE SET NULL` — workspace template can reference its platform parent.
- Index for lookup.

**Library API:**
- `/api/advance/templates` already returns platform + workspace. Update sort: workspace forks REPLACE platform parent in the list (don't show both). Show platform-original only if no workspace fork exists.

**Builder UI:**
- "+ Add custom field" button at bottom of each section card in canvas.
- Click → inline form OR modal (your call — modal is cleaner for forms with multiple inputs).
- Submit → POST → templates refresh → new field appears in current section AND in library card's expanded view.
- The "all future tours" warning is visible in the form.

### 7.4 Acceptance

- [ ] In builder canvas, every section card has "+ Add custom field" at the bottom.
- [ ] Click → form to enter label + type + required.
- [ ] Submit:
  - First time on a platform section: workspace fork created, new field appears.
  - Subsequent times on same section: same workspace fork updated.
- [ ] New field visible in current section's canvas immediately.
- [ ] Open library card for the section → expanded view shows the new field as a workspace addition.
- [ ] Create a new tour → drag the section from library → fields include the workspace addition.
- [ ] Other workspaces NOT affected (their templates unchanged).
- [ ] Lint + typecheck clean.

### 7.5 Quote in report

- Mockup sign-off timestamp.
- New API route.
- Migration adding `forked_from_id`.
- Builder UI integration.
- Library list filtering (forks replace originals).

### 7.6 Commit

`feat(advance,api,db): custom fields on platform headers via workspace fork (Sprint 8.6 §6)`

---

## V. Verify

CC: cannot run live UI tests. Static checks:

1. Lint baseline 75/120 held (target: stay at 70/120 from 8.5).
2. Typecheck zero.
3. Build succeeds.
4. Hex grep across new files returns zero.
5. Migrations apply cleanly via dry-run.
6. Acceptance criteria quoted per phase.

Adam runs live smoke after merge.

---

## When done — report exactly this format

```
Sprint 8.6 done. Branch: fix/sprint-8.6-fixes-plus-overhaul (off Sprint 8.5 branch)
Vercel preview: <URL>

Commits in order:
- 1: <hash> fix(shell-v2): close switcher residual flash
- 2: <hash> fix(shell-v2): switcher dropdown scrolls inside panel
- 3: <hash> fix(routing): address column fills on autocomplete pick
- 4: <hash> fix(advance): drag reorder persists
- 5: <hash> feat(advance,db): Key Contacts consolidation
- 6: <hash> feat(advance,api,db): custom fields on platform headers via workspace fork

Diagnoses signed off:
[Phase 1] at <ts>
[Phase 3] at <ts>
[Phase 4] at <ts>
[Phase 5 migration] at <ts>
[Phase 6 mockup] at <ts>

Quoted post-fix lines:
[Phase 1] DevTools observations + fix
[Phase 2] flex/overflow values
[Phase 3] network observations + fix
[Phase 4] drag state observations + fix
[Phase 5] migration file + builder restriction + read view pin
[Phase 6] new API route + migration + UI integration

V.1-6 results:
1. Lint
2. Typecheck
3. Build
4. Hex grep
5. Migrations
6. Acceptance

Out of scope, deferred:
[list]
```

---

## Out of scope this sprint

1. **Phase 4 Operations migration** — Sprint 9.
2. **Image cropping** — Sprint 9 (deferred from 8.5).
3. **Workspace activity feed time-bounding** — Sprint 8.4 deferred.
4. **Audit log surfaced UI** — Sprint 9.
5. **Email/SMS notification infra** — Sprint 10.
6. **Mobile PWA** — Sprint 11+.
7. **TourWizard retirement** — separate sprint.
8. **Spotify search → genre extension** — separate sprint.
9. **AdvanceOverviewStatsStrip orphan deletion** — cleanup sprint.
10. **`<DangerConfirmModal>` primitive extraction** — refactor opportunity.
11. **5 baseline lint errors** — long-deferred.
12. **404 page CTAs**, **print button regression**, **status pill autosave**, **custom field plus button** — long-deferred.
13. **Auto-link existing persons by email backfill** (Sprint 9 schema deferred).

If you find another bug — note in deferred. Don't fix.
