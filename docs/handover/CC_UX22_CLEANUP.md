# UX22 Cleanup — Edit View Layout + Read View Surface + Field-Level Polish

> Polish pass after UX22 (Phases 1-5). The audit found Phases 1/2/4/5 shipped correctly; Phase 3 only polished the read view and never touched the edit view. Adam's screenshots show a visibly broken edit layout — squashed two-column-inside-two-column geometry inside DocumentCanvas's 720px prose column. This prompt fixes the visible mess first, then completes Phase 3's promised field-level polish, then handles the low-severity tail.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/cursor-prompts/CURSOR_PROMPT_UX22_ADVANCE_OVERHAUL.md` — the original UX22 prompt; this cleanup completes work it implied but didn't enforce on the edit view
3. `docs/components/SLIDE_OVER_CONTRACT.md`
4. `src/components/document/DocumentCanvas.tsx` and `DocumentCanvasProse.tsx` — see the 720px hard cap that's squashing the edit view
5. `src/app/(app)/tours/[id]/advance/[routingId]/page.tsx` — currently wraps BOTH modes in `<DocumentCanvas mode="prose">`
6. `src/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder.tsx` — 5,361 lines; the edit view; wasn't touched by Phase 3

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/121 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. **Preserve every existing edit-view feature** — drag-drop reorder, copy field, copy section, custom-section delete (relies on Migration 059 RLS — already shipped), custom-field delete from library, layout apply, autosave. The audit found the floating Sections aside is the user's section-nav anchor; do not remove its function, only its broken layout.
7. Four commits, in order: P1 → P2 → P3 → P4.

---

## P1. Fix the edit-view layout (~90 min)

This is the visible mess. The route file wraps both read and edit children in `<DocumentCanvas mode="prose">` (`src/app/(app)/tours/[id]/advance/[routingId]/page.tsx:99-129`). `DocumentCanvasProse` hard-caps content at `max-width: 720px`. The edit builder then renders a two-column flex (date strip + main) and a *second* two-column flex inside main (form + right "Sections" aside) — four columns of intent stuffed into 720px. Result: floating Sections panel, header text wrapping, "Save" button alone on a line.

### P1.1 Decision: bypass DocumentCanvas in edit mode

The read view legitimately wants the prose canvas (it's a document — narrow column is correct). The edit view is an app surface, not a document. **In `src/app/(app)/tours/[id]/advance/[routingId]/page.tsx`, render the edit child OUTSIDE DocumentCanvas, at full PageShell width.**

Implementation sketch (read the actual file before applying — line numbers may have shifted):

```tsx
{isEdit ? (
  // Edit mode: full-width app surface, no prose canvas
  <>
    <AdvanceShowContextBar {...contextBarProps} />
    <AdvanceSectionBuilder {...builderProps} />
  </>
) : (
  // Read mode: keep the document canvas
  <DocumentCanvas mode="prose">
    <AdvanceShowContextBar {...contextBarProps} />
    <AdvanceShowReadView {...readProps} />
  </DocumentCanvas>
)}
```

ContextBar's negative-margin trick (line 161 of `AdvanceShowContextBar.tsx`) only works inside DocumentCanvas. When mounted in edit mode outside it, drop the negative margin via a prop or a parent class — see P4.2.

### P1.2 Retire the duplicate Header

`AdvanceSectionBuilder.tsx:606-703` renders a chunky pre-UX22 sticky header showing artist/tour/date/venue/status/save. **Every one of those data points is now in `AdvanceShowContextBar`.** Replace this Header with a slim toolbar that contains only what the ContextBar doesn't: autosave indicator, Save button, "Discard" link. Sticky `top: var(--lp-space-12)` so it sits below the ContextBar.

Keep the existing autosave/save behaviour wiring intact — just shrink the visual.

### P1.3 Replace the floating Sections aside with the LeftRail docSections variant

`AdvanceSectionBuilder.tsx:2146-2189` renders a `<aside>` with a list of section anchors. UX02's LeftRail already supports a `docSections` variant for exactly this use case (used by AdvanceShowReadView). The Phase 3 anchor IDs (`advance-{slug}`, scroll-mt-32) are already in place on the read view.

In edit mode, populate the LeftRail's docSections from the section list and remove the in-page aside. Active-section detection uses IntersectionObserver against the same `advance-{slug}` ids — port the existing observer logic from the read view if needed.

If the LeftRail's docSections variant isn't already mounted on the edit page (it's mounted via PageShell), check `app-page-shells.tsx` for the document-archetype rail config and ensure the edit route uses it (or a builder-archetype variant — confirm with Adam if uncertain).

### P1.4 Acceptance

- [ ] Edit view fills PageShell width (no 720px cap)
- [ ] Single Header section: ContextBar + slim toolbar (autosave, Save, Discard). No duplicate breadcrumb.
- [ ] Section anchor nav lives in LeftRail. No `<aside>` floating in main column.
- [ ] All existing builder features still work: drag-drop reorder, custom field, custom section, save layout, apply layout, autosave, status/owner picker, copy-to-other-shows menu.
- [ ] No lint/type regressions.

### P1.5 Commit

```
fix(advance-edit): full-width edit view + retire duplicate Header + LeftRail section nav

Edit view was wrapped in <DocumentCanvas mode="prose"> (720px hard
cap) alongside a two-column-inside-two-column flex layout, producing
a squashed floating Sections panel, a wrapped header with the Save
button alone on a line, and cramped form fields.

- page.tsx: render edit child outside DocumentCanvas. Read child
  keeps the prose canvas.
- AdvanceSectionBuilder Header (606-703) replaced by a slim toolbar
  (autosave + Save + Discard); breadcrumb data lives in the
  AdvanceShowContextBar from UX22 phase 2.
- Floating Sections <aside> retired; LeftRail docSections variant now
  carries the section anchor nav using the advance-{slug} ids that
  UX22 phase 3 already wired.

Made-with: Claude Code (UX22 cleanup pass)
```

---

## P2. Read-view surface polish (~25 min)

The read view's "narrow column with massive black margins" is correct-by-design (document archetype) but reads as void because there's no surface treatment between the prose column and the dark page background.

### P2.1 Add a paper-style surface around the prose

Inside `DocumentCanvasProse.tsx` (or via a new `surface` prop on `DocumentCanvas` that defaults to `false` to avoid touching other doc surfaces), wrap the inner prose content in:

```tsx
<div
  style={{
    background: 'var(--lp-surface)',
    border: '1px solid var(--lp-border)',
    borderRadius: 'var(--lp-radius-lg)',
    padding: 'var(--lp-space-8) var(--lp-space-6)',
    margin: 'var(--lp-space-6) auto',
  }}
>
  {children}
</div>
```

Token check before writing: confirm `--lp-radius-lg` and `--lp-space-8` exist in `src/app/globals.css` — substitute the closest existing token if not.

The advance read view (`/tours/[id]/advance/[routingId]` non-edit) opts in via `surface={true}` on `<DocumentCanvas>`. Other DocumentCanvas consumers (deal memos, rider packs, public share view) keep the default no-surface render until polished one-by-one.

### P2.2 Acceptance

- [ ] Advance read view shows prose content on a surface-coloured "page" with a soft border, not floating on `--lp-bg`
- [ ] Sticky `AdvanceShowContextBar` still sits flush at top — adjust its negative margin if needed (see P4.2)
- [ ] Print stylesheet still produces a clean printout (the surface should not print as a coloured block — gate the surface styles behind `@media not print` or use `print:bg-transparent print:border-0` if Tailwind utilities are still in scope)
- [ ] No regression to deal memos / rider packs / public share view

### P2.3 Commit

```
fix(document-canvas): optional paper-style surface around prose mode

Adam's UX22 audit flagged the advance read view as reading like
"prose floating in a black void". Adds an opt-in surface treatment
on DocumentCanvas (surface={true}) that wraps prose content in an
lp-surface card with a soft border. Advance read view opts in;
other consumers (deal memos, rider packs, public share) keep the
default unsurfaced render until polished individually.

@media not print disables the surface so printout stays clean.

Made-with: Claude Code (UX22 cleanup pass)
```

---

## P3. Edit-mode field-level polish — Phase 3 finished (~scope pressure expected)

This is the big one. UX22 Phase 3 polished read-view section cards (status tokens, anchor IDs, scroll-mt). Phase 3 was supposed to also polish the edit view per the original prompt's §5.2: tokenise status colours, swap person/hotel/flight pickers for `<EntityChip>`, swap embedded schedule editors for `<SpreadsheetGrid>`. None of that landed in `AdvanceSectionBuilder.tsx`.

This is potentially multi-day. **Time-box it: aim for 3 hours. If you hit the wall, commit what's done and write a follow-up note in the file's TODO pointing at what's left.**

### P3.1 Status tokenisation

In `AdvanceSectionBuilder.tsx`, replace any hardcoded status colours with `--color-lp-status-{not-started,in-progress,needs-review,complete}`. The Phase 3 read-view code (`AdvanceShowReadView.tsx:340-359`) is the reference shape — `color-mix(in srgb, <token> 12%, transparent)` for the bg tint, full token for dot + text.

Sweep candidates: section status pills, owner pills, autosave indicator, success toasts. Grep for hex literals:
```bash
grep -nE '#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}\b' src/app/\(app\)/tours/\[id\]/advance/\[routingId\]/AdvanceSectionBuilder.tsx
```

### P3.2 EntityChip swap-in

Field types whose value is a person/hotel/flight reference should render their picker as `<EntityChip>` not a custom dropdown. Find the field-type switch (likely a `FieldEditor` or per-type renderer). Concrete swaps:

- Field type `person_picker` (or whatever the schema calls it) — render selected value as `<EntityChip kind="person" id={value} />`. Picker still uses the existing search modal but the selected display is a chip.
- Field type `hotel_picker` / `room_picker` — `<EntityChip kind="room" id={value} />`.
- Field type `flight_picker` — `<EntityChip kind="flight" id={value} />`.
- Gear references (rare in advance) — `<EntityChip kind="gear" id={value} />`.

If a field type is multi-select, render `value.map(id => <EntityChip ... />)`.

Existing picker/search modals stay — only the inline display changes.

### P3.3 SpreadsheetGrid for schedule fields

Field type `schedule` (or `multi_row_table` — confirm from the field schema in `src/types/`) currently uses an in-house multi-row editor. Replace with `<SpreadsheetGrid>` from `src/components/spreadsheet-grid/SpreadsheetGrid.tsx`. Read `docs/components/SPREADSHEET_GRID_CONTRACT.md` first.

If the schedule field's column shape (time / activity / notes) doesn't map cleanly to a static SpreadsheetGrid column config, this swap is bigger than P3 can hold — flag and defer to its own prompt with a `// TODO(UX22-cleanup-P3.3)` marker on the existing editor and move on.

### P3.4 Acceptance

- [ ] No hex literals in `AdvanceSectionBuilder.tsx` outside of the `CUSTOM_SECTION_ICONS` data and any explicitly-tokenised brand-orange tints (which must be `#FF45001a` literals or `color-mix`, never JS string concat per CLAUDE.md)
- [ ] Person/hotel/flight/gear picker selected-state renders as `<EntityChip>`
- [ ] Schedule field uses `<SpreadsheetGrid>` OR has an explicit deferral TODO with a follow-up prompt named
- [ ] All existing edit features still work end-to-end on a test show (drag-drop, custom field add/delete, custom section add/delete, autosave, save, apply layout)

### P3.5 Commit

```
fix(advance-edit): finish UX22 phase 3 — token sweep + EntityChip + SpreadsheetGrid

UX22 phase 3 polished the read view but left AdvanceSectionBuilder
(the edit view) on legacy chrome. Catches up:
- Hardcoded status hex → --color-lp-status-* tokens via color-mix.
- person/room/flight/gear picker selected-state → <EntityChip>.
- Schedule field editor → <SpreadsheetGrid> (or deferred with TODO
  if column shape doesn't fit a static config).

Made-with: Claude Code (UX22 cleanup pass)
```

---

## P4. Tail (~30 min total)

Three low-severity items the audit surfaced. Bundled into one commit.

### P4.1 Overview archetype: document → list

`src/app/(app)/tours/[id]/advance/page.tsx` currently inherits the document archetype via `docDaysAppPageShell`. Per the original UX22 prompt §1.6, the overview is a list. Switch to `listAppPageShell` (or whatever the list-archetype helper is named in `app-page-shells.tsx`) and verify the LeftRail still shows the day rail content.

If the day rail is currently sourced from the document-archetype rail config, port the day-rail variant into the list archetype (or use the list-archetype's filter rail if that's more appropriate — confirm with Adam if uncertain).

### P4.2 Decouple ContextBar negative-margin from a specific token

`src/components/advance/AdvanceShowContextBar.tsx:161` uses `marginTop: 'calc(-1 * var(--lp-space-12, 48px))'`. This works only because `DocumentCanvasProse` happens to use `--lp-space-12` for its top padding. Brittle.

Replace with a layout-driven approach:
- Option A: `position: sticky; top: 0` and let the parent container's `padding-top: 0` keep things tight — drop the negative margin entirely.
- Option B: pass an explicit `flush` boolean prop and let the parent decide whether to apply negative margin or not.

Pick A unless it breaks the read view's visual; B otherwise.

### P4.3 DayOffNotesModal → SlideOver

`AdvanceOverview.tsx:710-841` — the modal is flagged in its own comment as "will move into the SlideOver primitive in a later UX22 polish pass." That pass is now. Convert to `<SlideOver>` (UX03 primitive), default width, backdrop=true.

Existing API surface: `tourId`, `routingId`, `dayType`, `notes`, `onSave`, `onClose`. Keep identical.

### P4.4 Acceptance

- [ ] Advance overview uses list archetype; day rail still renders correctly
- [ ] ContextBar's negative-margin coupling removed
- [ ] DayOffNotesModal uses `<SlideOver>` primitive
- [ ] No lint/type regressions

### P4.5 Commit

```
chore(advance): tail polish — list archetype + ContextBar token decouple + DayOffNotesModal slide-over

Three low-severity items from the UX22 audit:
- Overview page archetype switched document → list (matches original
  UX22 prompt §1.6).
- AdvanceShowContextBar's negative-margin coupling to --lp-space-12
  removed (was brittle if DocumentCanvasProse padding ever changed).
- DayOffNotesModal converted from rolled-own backdrop/aside to the
  <SlideOver> primitive (UX03), default width, backdrop=true.

Made-with: Claude Code (UX22 cleanup pass)
```

---

## Final verification

After P1 → P4:

1. **Edit view**: `/tours/[id]/advance/[routingId]?edit=1` (or however edit mode is triggered) — full-width, single header (ContextBar + slim toolbar), section nav in LeftRail, no floating panel, all builder features functional.
2. **Read view**: same URL without edit — prose-shaped column with a paper-style surface, ContextBar flush at top, EmptySectionCTA still works, copy-from-previous-show still works.
3. **Overview**: `/tours/[id]/advance` — DataTable-driven show list, LeftRail = day rail, status filter chips work, ⋯ menu has Apply / Manage / Copy / Bulk status / Print, Bulk status SlideOver opens.
4. **EntityChips**: open a show with a hotel field populated; the picker shows the room as an EntityChip; click → opens the room slide-over.
5. **Day-off row**: click an off/travel/rehearsal row → DayOffNotesModal opens as a SlideOver; save persists; close returns to overview.
6. **Print**: `Cmd+P` from a show's read view — clean printout, no surface tint, no ContextBar, no LeftRail.
7. Lint + typecheck clean.

Report SHAs to Adam.

---

## When done

```
UX22 cleanup done.
Commits: <P1-sha>, <P2-sha>, <P3-sha>, <P4-sha>.
- P1: edit view full-width, single header, LeftRail section nav
- P2: read view paper-style surface around prose
- P3: status tokens + EntityChip + (SpreadsheetGrid OR deferral
  TODO) inside AdvanceSectionBuilder
- P4: list archetype + ContextBar decouple + DayOffNotesModal
  → SlideOver
- Lint + typecheck clean
- Built via next build --webpack (no Turbopack)
```

If P3.3 (SpreadsheetGrid for schedule fields) was deferred, surface that explicitly in the report so Adam can queue the follow-up.
