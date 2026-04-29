# UX22 — Advance System Overhaul

> Full visual + flow rebuild of the advance system. Five phases, each landable independently. Don't bundle. Stop and ping after each phase.
>
> The existing advance system has feature parity (drag, copy content, copy layouts, status, attachments, comments, day-type categorisation) but the UI predates the UX overhaul and looks/feels worse than the rest of the app. **Preserve every feature.** Polish the surfaces and improve the flow on top.

---

## 0. Required reading

1. `CLAUDE.md` (repo root)
2. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — sections 2 (canon), 3.4 (page archetypes), 4 (canonical entities)
3. `docs/components/SLIDE_OVER_CONTRACT.md`
4. `docs/components/DATA_TABLE_CONTRACT.md`
5. `docs/cursor-prompts/CURSOR_PROMPT_UX17_ADVANCE_DOCUMENT.md` — UX17 wrapped advance pages in `<DocumentCanvas>` but explicitly deferred AdvanceOverview redesign per §3.1's escape hatch. UX22 picks that up.
6. `src/components/advance/AdvanceOverview.tsx` — current overview component (982 lines, pre-overhaul)
7. `src/components/advance/AdvanceShowReadView.tsx` — current per-show component
8. `src/components/advance/AdvanceSectionBuilder.tsx` — section drag-drop reorder, content editing
9. `src/components/advance/AdvanceCopySectionsDialog.tsx` (or similar) — copy-content-to-shows dialog
10. `src/components/advance/AdvanceLayoutManager.tsx` (or wherever) — layout template management

---

## 1. Design canon (don't deviate)

Inherits the Lowpass design canon from the roadmap:

1. **Daysheets × Notion aesthetic.** Bug Reports is the visual baseline.
2. **Functional + light orange.** `--lp-orange` is an accent, not a primary fill.
3. **Tables for everything** (comfortable density default; compact for power-grids).
4. **Slide-over = context only**, never primary edit. (Per-show advance is a `<DocumentCanvas>` page, not a slide-over — that's correct.)
5. **Single record, multiple views.** Flight / Person / Room / Gear references in advance use EntityChip (UX08).
6. **Predictable page archetypes.** Overview = `list`. Per-show advance = `document`. Templates = `list`.
7. **Top-bar + archetype-driven left rail.** Already done by UX02/UX04. Don't change.
8. **Foundation first, pages second.** All primitives exist; this prompt only consumes them.

UX22-specific principles:

9. **Context never lost.** Artist → Tour → Show breadcrumb is always visible on per-show pages. The user can tell at a glance which show they're editing.
10. **Information density without noise.** Lots of data per show; group hierarchically; whitespace earns its place.
11. **Preserve every feature.** Drag-drop section reorder, copy content between shows, copy/apply layouts, section status workflow, file attachments, comments, "save as template" — all stay. Visual polish only; no feature deletions without explicit user approval.

---

## 2. Hard rules (every phase)

1. **No new dependencies.** No npm installs.
2. **All visual values via `var(--lp-…)` tokens.** No hardcoded hex / px / shadows in component code. Hex+alpha for orange tints.
3. **Use existing component primitives:** `<DataTable>` (UX05), `<SlideOver>` (UX03), `<DocumentCanvas>` (UX07), `<EntityChip>` (UX08). Don't roll your own.
4. **Workspace-scoped via existing RLS helpers** (`public.get_my_workspace_id()`, `public.is_workspace_admin()`).
5. **Migration numbers next-sequential.** As of this writing, main is at 057. Anything new starts at 058.
6. **No `any`. No `// @ts-ignore`. No commented-out code.**
7. **Lint + typecheck clean** vs the 75/121 baseline before each commit.
8. **Don't run `npm run build`** — Turbopack hangs on Drive.
9. **Per-phase commits.** Don't bundle phases.
10. **Existing features stay.** Drag-drop, copy content, copy layouts, status, attachments, comments — every one verified working post-redesign before declaring done.

---

## 3. Phase 1 — Overview page redesign (~2 hrs)

The page Adam pointed at: `/tours/[id]/advance`. Currently dominated by a Flights card and a 6-card "Suggested form layouts" grid that together eat ~50% of the viewport above the fold; the actual show list is below that.

### 3.1 Target shape

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Dashboard › Tours › College Shows | Apr'26 › Advance       │
│ Page title: Advance — College Shows | Apr'26                            │
│ Subtitle:   Manage advance forms and section progress for each show.    │
├─────────────────────────────────────────────────────────────────────────┤
│ [Filter chips: All • Not Started • In Progress • Complete • Needs Review]
│ [Search venue, city, address...]                              [⋯ menu] │
├─────────────────────────────────────────────────────────────────────────┤
│ Date     Venue                   City              Status   Sections   │
│ ▌Fri 10  Georgetown University   Washington        ● In P   1/5       →│
│ ▌Sat 11  Barnato                 Omaha             ○ Not    0/0       →│
│ │Sun 12  Travel · West Hollywood                                       │
│ │Mon 13  Day Off · West Hollywood                                      │
│ ▌Thu 16  Texas State University  San Marcos        ○ Not    0/0       →│
│ ...                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Concrete changes

**Remove from the overview entirely:**
- The Flights card. Flights belong in Budget Travel section (UX09 derives those rows already) and per-show advance pages (UX17 wraps each show's advance with EntityChip flight refs). Showing them at the top of `/advance` is redundant.
- The "Suggested form layouts" 6-card grid. Layout management is admin work — moves to a `⋯` menu button in the toolbar (see below).
- The right sidebar's Layout Templates / Last Edit panels. Last-edit info goes inline as a "Last edited 7d ago" line in the toolbar; layout count goes inside the `⋯` menu.

**Promote the show list to the dominant element:**
- Wrap in `<DataTable>` from UX05 (the real one, not the stub adapter).
- Columns: **Date** · **Venue** · **City** · **Status** · **Sections progress** · row-action chevron.
- Row left-edge: 4px coloured strip using `--color-lp-day-{show,off,travel,rehearsal,press,radio,tv,festival}` tokens (the day-type colours from UX01). Show-day rows get the brand-orange accent treatment; off/travel/rehearsal rows get muted.
- Status column: pill component (`Not started` / `In Progress` / `Complete` / `Needs Review`) with status colours from `--color-lp-status-*` tokens.
- Sections progress: small ring or bar showing `X/Y` (e.g. `1/5` with 20% filled), in `--lp-orange` for in-progress, `--color-lp-success` for complete.
- Click row → navigate to `/tours/[id]/advance/[showId]`.
- Keyboard-nav inherited from DataTable (UX05).
- Status filter chips above the table feed into DataTable's column filter API.
- Search box top-right of the toolbar — feeds DataTable's `searchable` prop searching venue / city / address fields.

**Toolbar `⋯` menu (right side):**
- Apply layout to shows… → opens existing `AdvanceCopyLayoutsDialog` (or whatever the current component is)
- Manage templates → navigates to `/templates`
- Copy advance content from another show… → opens existing copy-content dialog
- Bulk update status… → opens a small bulk-update slide-over
- Print overview → opens print dialog
- Export CSV (defer if not already wired)

**Toolbar text line (left of `⋯` menu):**
- `N shows` · `Last edited 7d ago` · `5 layout templates`

### 3.3 Implementation

1. Refactor `src/components/advance/AdvanceOverview.tsx` (or replace with a new `AdvanceOverviewClient.tsx`):
   - Drop the Flights card + Suggested layouts grid + right sidebar
   - Build a `<DataTable>` with the columns above using the real DataTable API (not the stub adapter)
   - Map advance/show data to row objects with `dayType`, `status`, `progress` fields
   - Wire row click to `useRouter().push(\`/tours/\${tourId}/advance/\${showId}\`)`
   - Off/travel/rehearsal rows render as muted lighter rows; show-day rows render with full status + progress

2. Move the `⋯` menu into a `<DropdownMenu>` (use existing pattern from rider packs row menu or similar).

3. Toolbar: simple flex row at top of the page, search + filter chips left, last-edit + count + ⋯ menu right.

### 3.4 Acceptance

- [ ] Page no longer shows the Flights card
- [ ] Page no longer shows the Suggested form layouts grid
- [ ] Right sidebar's layout-template card removed (info moved into toolbar / `⋯` menu)
- [ ] Show list uses the real `<DataTable>` (verify by checking import `from '@/components/data-table/DataTable'`, not `from '@/components/entity/DataTable'`)
- [ ] Day-type colour strips visible on the left edge of each row
- [ ] Status pills colour-coded per advance state
- [ ] Sections progress shown as `X/Y` with visual indicator
- [ ] Click row → navigates to per-show advance
- [ ] Filter chips + search work via DataTable's column filter / searchable props
- [ ] `⋯` menu items work: Apply layout / Manage templates / Copy content / Bulk status / Print
- [ ] All existing features still callable (drag-drop / copy / etc. — verify none were dropped)
- [ ] Lint + typecheck clean (75/121 baseline)
- [ ] No new dependencies

### 3.5 Commit + stop

```
UX22 phase 1: /advance overview redesign

Drops the Flights card + Suggested form layouts grid + Layout Templates
sidebar. Promotes the show list to the dominant element via the real
<DataTable> primitive (UX05).

Show list shape:
- Day-type colour strips per row (--color-lp-day-*)
- Status pills (Not started / In Progress / Complete / Needs Review)
- Sections progress (X/Y) with visual indicator
- Row click → /tours/[id]/advance/[showId]
- Filter chips + search wired to DataTable's column filter / searchable

Toolbar consolidates secondary actions behind a `⋯` menu:
- Apply layout to shows... (existing AdvanceCopyLayoutsDialog)
- Manage templates → /templates
- Copy content from another show... (existing dialog)
- Bulk status update...
- Print

Existing features preserved end-to-end. No new deps.

Made-with: Claude Code (UX22 advance overhaul)
```

**Stop here. Push. Tell Adam in chat. Wait for "go to phase 2".**

---

## 4. Phase 2 — Sticky context header on per-show pages (~1 hr)

Per-show advance pages (`/tours/[id]/advance/[showId]`) are wrapped in `<DocumentCanvas mode="prose">` after UX17. The user-flow gap: as you scroll down through advance sections, you lose track of which show you're working on.

### 4.1 Target

A sticky header at the top of the document area (just below the TopBar / above the day rail) showing:

```
[Artist avatar] Artist Name · Tour Name · Show day type · Date · Venue · City    [Progress: 3/8]
```

- All segments link upstream where applicable (Artist → `/artists/[id]`, Tour → `/tours/[id]`)
- Progress chip on the right: `3/8 sections complete` with a small ring
- Day-type pill before the date (matches the overview row strips)
- Sticky position; backdrop blurs slightly when content scrolls under it

### 4.2 Implementation

1. New component `src/components/advance/AdvanceShowContextBar.tsx` (`'use client'`)
2. Renders inside `AdvanceShowReadView` and `AdvanceShowEditView` (or wherever the per-show page composes its body) as the first child of `<DocumentCanvas>`'s prose slot
3. CSS: `position: sticky; top: 0; z-index: var(--lp-z-sticky);` with `backdrop-filter: blur(8px)` and a subtle `--lp-border` bottom edge
4. Data: pass artist / tour / show / progress as props from the server component (already fetched)
5. Avatar rendering: reuse the `AccountAvatar` pattern from the TopBar fix (Step B of the A/B/C sprint)

### 4.3 Acceptance

- [ ] Context bar visible on per-show advance pages
- [ ] All segments correctly populated (artist name, tour name, day type, date, venue, city)
- [ ] Sticky positioning works through scroll
- [ ] Progress chip updates live as sections are completed
- [ ] Click artist → `/artists/[id]`
- [ ] Click tour name → `/tours/[id]` (tour overview)
- [ ] Backdrop blur visible when content scrolls under
- [ ] Print stylesheet hides the bar (it's chrome, not content)

**Stop here. Push. Wait for "go to phase 3".**

---

## 5. Phase 3 — Per-show layout polish (~2 hrs)

Per-show advance pages currently render existing inner components inside `<DocumentCanvas>` (UX17). The chrome is right but the inner content needs visual polish to match Bug Reports / Daysheets.

### 5.1 Target

For each section in the advance:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ▌Section heading                                              [● Status]│
│  Optional subtitle / description                       [⋯ section menu]│
├─────────────────────────────────────────────────────────────────────────┤
│  [Section content — prose / fields / schedule grid]                     │
│                                                                         │
│  [Attachments rail]                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

- Section heading: `--lp-text-xl` weight 600
- Section subtitle: `--lp-text-sm` `--lp-text-secondary`
- Status pill on the right: same colours as overview (Not started / In Progress / Complete / Needs Review)
- `⋯` menu: existing actions — Reorder / Copy to other shows / Save as template / Reset / Delete
- Drag handle visible on hover for reorder (preserve existing drag-drop logic)
- Section anchors emit `id={\`advance-${section.id}\`}` so the day rail's IntersectionObserver-based active-section highlight works
- Attachment rail: small chip-strip of attached files at the bottom of each section

### 5.2 Field-level polish

- Text fields: use the existing `<Input>` / `<Textarea>` / `<Select>` primitives
- Date/time fields: native pickers but with `--lp-native-date-input` styling
- Schedule grids inside a section (load-in time, sound check, doors, set times): use `<SpreadsheetGrid>` (UX06) in compact density
- Contact fields: use `<EntityChip kind="person" />` (UX08) — click opens PersonSlideOver
- Hotel fields: `<EntityChip kind="room" />` — click opens RoomSlideOver
- Flight fields: `<EntityChip kind="flight" />`

### 5.3 Implementation

1. Identify the per-section render component (likely `src/components/advance/AdvanceSectionRenderer.tsx` or similar)
2. Wrap each section in a card with the heading shape above
3. Add the section anchor `id` so day rail scroll-spy works
4. Replace any rolled-own "person picker" / "hotel picker" / "flight picker" with `<EntityChip>` clicks
5. For fields that should be a small spreadsheet (multi-row schedule), use `<SpreadsheetGrid>` instead of bespoke table

### 5.4 Drag-drop preservation

Verify the existing drag-drop reorder logic still works post-polish:
- Drag handle visible on hover
- Section moves visually during drag
- Drop target highlights
- Save persists to backend
- Cancel/escape works

**Don't refactor the drag-drop library or APIs.** Just verify the visual chrome doesn't break it.

### 5.5 Acceptance

- [ ] Each section card has heading / subtitle / status pill / `⋯` menu / content / attachments rail
- [ ] Status pills colour-coded
- [ ] Section anchors emit ids; day rail highlights active section as you scroll
- [ ] Drag-drop reorder still works
- [ ] Copy-section-to-shows still works
- [ ] Save-as-template still works
- [ ] EntityChip references work for person / hotel / flight fields
- [ ] Schedule grids (where applicable) use SpreadsheetGrid
- [ ] Visual aesthetic matches Bug Reports / Daysheets baseline
- [ ] Print stylesheet still produces clean output
- [ ] Lint + typecheck clean

**Stop here. Push. Wait for "go to phase 4".**

---

## 6. Phase 4 — Layout templates management (~1.5 hrs)

`/templates` exists from UX13b (a union view across rider packs / advance / budget templates). Advance-specific layout management currently lives inside the `/advance` page. UX22 phase 1 moved it behind a `⋯` menu but the underlying surface (the layout manager dialog or page) needs polish.

### 6.1 Target

When the user clicks "Manage templates" from the advance overview's `⋯` menu, they land on `/templates?type=advance` (a filtered view of the existing templates list). For applying a layout to multiple shows, the existing `AdvanceCopyLayoutsDialog` (or equivalent) opens — polish it to use the slide-over primitive.

### 6.2 Polish the layout-apply dialog

- Convert from rolled-own modal to `<SlideOver width="wide">`
- Header: "Apply layout to shows" + subtitle "Select shows to apply [Layout name] to"
- Body sections:
  1. Layout preview — section list with sections-count
  2. Show selection — multi-select list with checkboxes; each row shows date / venue / current layout / would-be-layout-after
  3. Conflict notes — if any selected show has existing custom sections, flag them
- Footer: `Apply to N shows` button with confirmation

### 6.3 Acceptance

- [ ] Layout-apply dialog uses `<SlideOver>` primitive
- [ ] Layout preview correctly shows what'll be applied
- [ ] Show multi-select works
- [ ] Conflict warnings show for shows with existing custom content
- [ ] Apply button confirms before destructive override
- [ ] Existing layout-apply API still wires correctly

**Stop here. Push. Wait for "go to phase 5".**

---

## 7. Phase 5 — Flow improvements (~2 hrs)

The "feels modern" jump comes from the UX micro-features users don't explicitly ask for but immediately appreciate.

### 7.1 Quick "copy from previous show" CTA on empty sections

When a section is empty on a show, show an inline CTA button:
```
[+ Copy this section's content from a previous show]
```
Click → small popover listing the same section from previous shows in this tour, click one → content copies in.

### 7.2 "Apply to remaining shows" on stable fields

Some fields (venue contacts, generic schedules) might apply to multiple shows. After the user fills one in, show a small footer button:
```
[+ Apply this field to remaining shows on tour]
```

Defer if scope is too tight. List as a phase 5 carryover.

### 7.3 Smart suggestions

When the user opens a show advance for a venue that's been used before in the workspace, surface:
```
This venue has been used 3 times. Copy contact info from [Most recent show]?
```

Defer if scope is too tight. List as carryover.

### 7.4 Bulk status update

From the `⋯` menu's "Bulk update status…" action, open a slide-over:
- Multi-select shows
- Pick a status
- Apply

Useful for end-of-tour reconciliation.

### 7.5 Acceptance

- [ ] Empty-section CTA visible on empty sections
- [ ] Click opens previous-shows picker
- [ ] Selection copies content correctly
- [ ] Bulk status update slide-over works end-to-end
- [ ] Existing copy-content + copy-layout features still work after polish
- [ ] Lint + typecheck clean

**Stop here. Push. Final phase.**

---

## 8. Verification across all phases

After phase 5 lands:

1. Smoke test: open `/advance`, scan show list, click into one show
2. Click filter chips — show list filters correctly
3. Search — venue / city search works
4. Click `⋯` → Apply layout → preview is correct → apply to shows → shows now have the layout
5. Open a show with existing advance content — sections render polished, status pills correct, drag-drop reorder works, EntityChips for person/hotel/flight clickable
6. Copy section content from one show to another — works
7. Save section as template — appears in template list
8. Mobile: open same show on `/m/show/[id]` — read view consistent with desktop polish
9. Print preview: clean output, day rail / context bar / `⋯` menu hidden, sections paginated naturally
10. Lint + typecheck clean

If any feature broke during the polish, fix before declaring done. The contract was "preserve every feature" — no exceptions.

---

## 9. Out of scope (do NOT do these in UX22)

- ❌ Changing advance section schemas
- ❌ Adding new field types
- ❌ Modifying drag-drop library or reorder APIs
- ❌ Touching the public share view (already polished in UX17)
- ❌ Building UX08b Command Palette (separate)
- ❌ Routing rewire to SpreadsheetGrid (Phase 4b territory)

---

## 10. When you're done

Tell Adam in chat:
- All 5 phase commits + SHAs
- Lint + typecheck status
- Anything you deferred and why (e.g. smart suggestions in phase 5)
- Whether existing features all verified working

Adam will manually smoke-test on Vercel after deploy.
