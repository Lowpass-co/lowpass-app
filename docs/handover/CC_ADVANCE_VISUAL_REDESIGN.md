# Advance Visual Redesign — Apply the Full Reference Structure

> Phase 2 shipped the migration but interpreted "apply reference template-builder aesthetic" too conservatively — added field-type icons + mono numerics, but didn't restructure the page layout. Adam expected the FULL structural redesign per the HTML reference: 280px left sidebar with upcoming shows + progress bars, sticky big-header with show name + template badge + last-edited line, "Advance Progress" card showing sections complete, tab nav (Show / Template Builder) replacing the `?mode=edit` query param. Phase 2's icon/typography work stays — this fix-up adds the structural shape on top.
>
> One PR off main. Three commits: A (per-show layout restructure) → B (advance overview dense treatment) → V (verify).
>
> **No new functionality** — every existing feature (drag-drop, custom sections, Previously Played, copy-from-show, bulk update, save layout, apply template) carries forward unchanged. This is purely a visual restructure.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/CC_PRODUCT_SPLIT_PHASE2.md` — what Phase 2 shipped (the structural gap is in §B's interpretation)
3. **The uploaded reference HTML files** — find Adam's uploads, three are relevant:
   - "Love the 'Previously Played' feature..." — the per-show advance with the 280px sidebar of upcoming shows + sticky big header + progress card. This is the structural target.
   - "Advance Section - Template builder..." — the template builder edit view. Same structural language.
   - "Love love love. though again, making it more of a to do list..." — REJECTED by Adam. Don't adopt the to-do framing from this one.
4. `src/app/(app)/advance/[tourId]/[routingId]/page.tsx` — current per-show advance page (post-migration)
5. `src/components/advance/AdvanceShowReadView.tsx` — read mode content
6. `src/components/advance/AdvanceSectionBuilder.tsx` — edit mode content
7. `src/components/advance/AdvanceShowContextBar.tsx` — existing context bar; gets folded into the new sticky header

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/120 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. Three commits in order: A → B → V.
7. **Adam's product locks** (do not relitigate):
   - **Advance is NOT a to-do list.** The reference HTMLs have "Mark All Complete" / "Tasks Done" framing that's task-oriented. **Replace with "Advance Progress" / "X of Y sections complete" framing.** No "Mark All Complete" button, no checkbox-on-fields styling.
   - **Drop the evidence-photo capture pattern** from any reference HTML that includes it.
   - **Preserve every existing feature**: Previously Played sidebar (Phase 2 §C), copy-from-show flow, custom sections, drag-drop reorder, save layout, apply template, bulk status update.
   - **Tab nav replaces `?mode=edit`**. URL becomes `/advance/[tourId]/[routingId]` for read mode, `/advance/[tourId]/[routingId]/build` for template builder. (Or keep `?mode=edit` as a redirect/alias if changing the URL is risky — confirm in audit.)

---

## A. Per-show advance layout restructure (~3 hr)

The big one. Replace the current single-column layout with the three-zone reference structure: top header + left sidebar + main content area.

### A.1 Top header (fold into ProductHeader OR layer above)

Inside the existing `<ProductShell>`, the per-show advance page needs an additional sticky header beneath ProductHeader showing:

```
ADVANCE / [show name e.g. Hangout Music Festival]                [Show | Template Builder]              Ctrl+S Save · Ctrl+D Duplicate     [Export PDF]
```

- Left: "ADVANCE" in brand orange + slash + show name (white, weight 500). The breadcrumb context for THIS show.
- Center: tab nav with two tabs — "Show" (the read view, current default) / "Template Builder" (the edit view, currently `?mode=edit`).
- Right: keyboard shortcut hints (Ctrl+S Save, Ctrl+D Duplicate) styled as muted small `<kbd>` chips, then Export PDF button.

This sub-header replaces the `<AdvanceShowContextBar>`'s top portion. The context bar's body content (artist · tour · day-type · date · venue · progress) folds into the sticky big-header below — see A.3.

### A.2 Left sidebar (280px, upcoming shows for this tour)

Replace the current date-strip rail with a richer 280px sidebar:

```
+--------------------------------+
| [Search upcoming shows...]     |
| COPY ADVANCE FROM...           |
| [Select a previous show ▾]     |
+--------------------------------+
| US FALL TOUR 2024              |
|                                |
| OCT 14, 2024  ← active (orange)|
| Madison Square Garden          |
| New York, NY                   |
| ===========o-----  65%         |
| 65% Complete · 2 Overdue       |
|                                |
| OCT 16, 2024                   |
| TD Garden                      |
| Boston, MA (from MSG Oct 14)   |
| =o----------------- 10%        |
| 10% Complete                   |
|                                |
| ... more shows ...             |
+--------------------------------+
```

Source data:
- All routing rows for this tour where `day_type IN ('show', 'festival')`
- For each: date, venue name + city, completion percentage (from `advance_instances.data` field count or whatever the existing progress signal is)
- "(from MSG Oct 14)" indicator if this show inherits an advance template applied from another show (use the existing copy-from-show audit trail if available; otherwise omit the indicator gracefully)

Active show: 2px brand-orange left border + `var(--lp-surface)` background, brand-orange date label.
Inactive show: hover lifts to `var(--lp-surface-hover)`.

The "Copy advance from..." dropdown at the top is a quick-access version of the existing copy-from-show modal — selecting a show triggers the same flow.

### A.3 Main content area — sticky big-header

The first child of the main content (above the read view OR template builder, depending on active tab):

```
+----------------------------------------------------------------------+
| Hangout Music Festival                                  [Mark... ]   |
| Gulf Shores, AL · 22 Mar 2026                                        |
| Template: Arena Standard v2 · Last edited 2h ago by JD               |
|                                                                      |
| ┌──────────────────────────────────────────────────────────────────┐ |
| │ Advance Progress              [progress bar]      26/40 sections │ |
| └──────────────────────────────────────────────────────────────────┘ |
+----------------------------------------------------------------------+
```

- Show name as H1 (`var(--lp-text-2xl)` weight 600, ~28px). Big.
- City + date sub-line below in `var(--lp-text-secondary)`.
- Template badge: small chip showing the applied layout template name. Click → ApplyAdvanceTemplateSlideOver.
- "Last edited Xh ago by [user]" with the editor's name (resolve via `profiles` join — Phase 1's auditor pattern).
- **Advance Progress card**: bordered, `var(--lp-bg-secondary)` background, label + progress bar + "X/Y sections complete" (NOT "tasks done" — Adam's lock).
- Right-aligned action: Edit Template button → switches to Template Builder tab. NO "Mark All Complete" button (to-do framing).

Sticky at top of main scroll context. Compresses on scroll if you want (optional polish — start without).

### A.4 Below the sticky big-header

Render either the read view (`<AdvanceShowReadView>`) or the template builder (`<AdvanceSectionBuilder>`) depending on the active tab from A.1. The components themselves don't change — they just render in this new container. They inherit Phase 2's typography + icons + mono numerics for free.

### A.5 Tab routing

Two options — pick one in audit:

**Option A**: query param. Tab toggles between `/advance/[tourId]/[routingId]` (Show) and `/advance/[tourId]/[routingId]?mode=builder` (Template Builder). Minimum diff from current.

**Option B**: subroute. `/advance/[tourId]/[routingId]` for Show, `/advance/[tourId]/[routingId]/build` for Template Builder. Cleaner URL.

Option B is cleaner; Option A is faster. Pick A unless the audit reveals subroute makes other code easier.

### A.6 Acceptance for §A

- [ ] Per-show advance page has the three-zone layout: top sub-header (ADVANCE / show name + tabs + keyboard hints + Export), 280px left sidebar with upcoming shows + progress bars + "Copy advance from..." dropdown, main content area with sticky big-header
- [ ] Sticky big-header: show name as H1, city+date sub-line, template badge, last-edited line, Advance Progress card with progress bar + "X/Y sections complete" framing
- [ ] Tab nav switches between Show (read view) and Template Builder (edit view) without page reload
- [ ] Active show in left sidebar has brand-orange left border + tinted bg
- [ ] Click another show in the sidebar → navigates to that show's advance
- [ ] All existing features still work: Previously Played, drag-drop, custom sections, save layout, apply template, copy from show, bulk update
- [ ] No "Mark All Complete" or "Tasks Done" framing anywhere
- [ ] No evidence-photo capture in field rows
- [ ] Lint + typecheck clean

### A.7 Commit

```
feat(advance): full structural redesign — sidebar of upcoming shows, sticky big-header, tab nav

Phase 2 §B applied icons + mono numerics but missed the structural
redesign Adam expected from the reference HTMLs. This fix-up adds the
three-zone layout:

- Sub-header beneath ProductHeader: "ADVANCE / [show name]" + tabs
  (Show / Template Builder) + keyboard hints (Ctrl+S, Ctrl+D) +
  Export PDF.
- 280px left sidebar replacing the date strip: upcoming shows for
  this tour with completion progress bars, "Copy advance from..."
  dropdown, active show highlighted with brand-orange left border.
- Sticky big-header in main content area: show name as H1, city +
  date, template badge, last-edited line, Advance Progress card
  with X/Y sections complete framing (NOT "tasks done" — advance
  is not a to-do list).
- Tab nav replaces ?mode=edit. Show tab renders AdvanceShowReadView;
  Template Builder tab renders AdvanceSectionBuilder. URL toggles
  between /advance/[tour]/[show] and /advance/[tour]/[show]?mode=builder
  (or /build subroute — see audit).

All existing functionality preserved (Previously Played, drag-drop,
custom sections, save layout, apply template, copy from show, bulk
update). Phase 2's icon/mono treatment stays.

Made-with: Claude Code (advance visual redesign)
```

---

## B. Advance overview dense treatment (~1 hr)

The advance overview at `/advance/[tourId]` (the day list across all shows in a tour) also needs the dense visual upgrade Adam expected.

### B.1 Apply the dense table treatment

Same density as Phase 3's budget table will get (or has gotten if Phase 3 ships first):

- Sticky stats strip beneath ProductHeader: "Tour Progress" / "Shows Complete" / "Shows Pending" / "Days Until First Show" / "Days Until Last Show" — mono numerics
- Dense table layout for the show list:
  - Day-type colour stripe in the date cell (already exists from UX22 phase 1)
  - Status pill + progress ring (already exists)
  - Hairline `var(--lp-border-subtle)` borders
  - Sticky thead
  - `var(--lp-mono)` on dates and counts
- Status filter chips above the table (already exist)
- Search + Filter + Columns + Export (already exist)
- "+ Show" or "Add show" primary button → opens routing creation flow

The existing `<AdvanceOverview>` from UX22 has most of this; just needs the visual polish to match.

### B.2 Acceptance for §B

- [ ] `/advance/[tourId]` overview shows sticky stats strip with tour-level progress numbers
- [ ] Show list table uses dense layout matching Adam's reference HTMLs
- [ ] All existing UX22 features (status filter chips, ⋯ menu, day-type strips, status pills, progress rings) preserved
- [ ] Lint + typecheck clean

### B.3 Commit

```
feat(advance): overview dense treatment matching reference

Sticky stats strip + dense table polish on the /advance/[tourId]
overview. Consistent with Phase 3's budget visual language.

All UX22 features (status filter chips, day-type strips, progress
rings, ⋯ menu) preserved.

Made-with: Claude Code (advance visual redesign)
```

---

## V. Verify (~20 min)

### V.1 Per-show layout (A)

1. Visit `/advance/[tourId]/[routingId]` for any populated show.
2. See: sub-header "ADVANCE / [show name]" + tabs + keyboard hints + Export PDF.
3. See: 280px left sidebar with upcoming shows, progress bars, active show highlighted.
4. See: sticky big-header with show name, city + date, template badge, last-edited line, Advance Progress card.
5. Click "Show" tab → renders read view content (sections + fields).
6. Click "Template Builder" tab → renders edit view content (template library + this show's advance).
7. Click another show in left sidebar → navigates to that show's advance.
8. Use "Copy advance from..." dropdown → triggers existing copy-from-show flow.
9. Previously Played still works on read view.
10. All edit-mode features (drag-drop, custom sections, save layout, apply template, bulk update) still work.

### V.2 Overview (B)

11. Visit `/advance/[tourId]` (no show id) — see dense table with sticky stats strip.
12. Status filter chips + search + ⋯ menu still work.
13. Click a show row → routes to per-show advance page.

### V.3 No regressions

14. Lint + typecheck clean. `next build --webpack` succeeds.
15. Phase 2 features (Previously Played sidebar, field-type icons, mono numerics) still present.
16. Budget + Operations pages unaffected.

---

## When done

```
Advance visual redesign done.
Commits: <A-sha>, <B-sha>.
- A: Per-show advance restructured to match reference HTML —
  three-zone layout with sub-header (ADVANCE / show name + tabs),
  280px left sidebar (upcoming shows + progress + copy-from
  dropdown), sticky big-header (H1 show name, template badge,
  last-edited, Advance Progress card). Tab nav replaces ?mode=edit.
- B: Advance overview gets sticky stats strip + dense table polish.
- All existing features preserved (Previously Played, copy-from-show,
  drag-drop, custom sections, save layout, apply template, bulk
  update, status chips, day-type strips).
- "Advance is not a to-do list" — no Mark-All-Complete, no Tasks-Done
  framing. "Advance Progress" + "X/Y sections complete" instead.
- Lint + typecheck clean. Built via next build --webpack.
```

If §A's sidebar shows up wider than 280px breaks the read view's prose width assumptions, surface in the report — we may need to drop the read view from the prose-canvas constraint and let it flow at full content width. Same pattern as the UX22 cleanup P1 fix for edit view.
