# Combined: Advance Visual Redesign + Product Split Phase 3 (Budget Migration)

> Two independent CC sprints in one document. They touch different pages so they can ship sequentially OR in parallel on separate branches. Recommended order: **Sprint 1 (Advance Visual Redesign) first**, then **Sprint 2 (Phase 3 Budget)** — Sprint 1 establishes the structural language Sprint 2's budget shell mirrors.
>
> Each sprint has its own branch + PR. Don't conflate commits.

---
---
---

# SPRINT 1 — Advance Visual Redesign

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

---
---
---

# SPRINT 2 — Product Split Phase 3 (Budget Migration)

# Product Split Phase 3 — Budget Migration + Summary Tab + Phase Tagging + Reference Template

> Phase 1 + 2 are on main. The full budget redesign from PR #6 (Phase Context strip, MacroAllocation donut, BurnRate chart, Receipt Inbox, duplicate detection, multi-currency, PDF/XLSX export, Settlement) is also on main. Phase 3 migrates the budget into `/budget/[tourId]/*` inside `<ProductShell>`, applies the dense spreadsheet template Adam sent as reference, adds a **Summary tab** at the top of the budget product (separates the big-picture overview from the line-item grind), and adds **phase tagging** on line items so they can be grouped/viewed by tour phase (pre-prod / rehearsals / show days / wrap) in addition to the existing category grouping.
>
> **Adam's product locks for budget:**
>
> 1. **Keep the existing category headers** (Production, Logistics, Travel, Crew, Accommodation, Catering, Marketing, Insurance, Contingency). Don't replace with the reference HTML's category list. The Lowpass categories stay.
> 2. **Phase tagging is additive, not a replacement.** Default grouping in the line-item view is by Category. Phase grouping is a toggle. Items without a phase tag fall into "Unscoped".
> 3. **Summary tab is the big-picture surface.** Phase Context strip + Macro Allocation donut + Burn Rate chart + variance summary + top spend categories live there. The line-item table moves to its own "Budget" tab — uncluttered, dense, spreadsheet-feeling.
> 4. **Preserve every feature from PR #6 + fix-up rounds.** Receipt Inbox sidebar, Quick Add templates, duplicate detection, variance callouts, bulk select, multi-currency display, PDF/XLSX export, Settlement at `/budget/[tourId]/settlement` — all carry forward. Don't tear them down to apply the new visual.
>
> One PR off main (Phase 2 will be merged by the time CC starts; if not, branch off `feat/product-split-phase2`). Six commits: M (migration 064 phase_tag column) → A (route migration into ProductShell) → B (visual template per reference) → C (Summary tab) → D (phase tagging UI + grouping toggle) → V (verify).

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/CC_PRODUCT_SPLIT_PHASE1.md` and `CC_PRODUCT_SPLIT_PHASE2.md` — what foundation + advance looks like
3. `docs/handover/CC_BUDGET_REDESIGN.md` and the fix-up docs (`CC_BUDGET_REDESIGN_FIXUP.md`, `CC_BUDGET_HUB_FIXUP_2.md`) — every feature Phase 3 must preserve
4. The uploaded "read notes but great budget template!.html" — Adam's visual reference. Dense spreadsheet aesthetic, sticky stats strip across the top, dense table with category group headers, status pills, mono numerics. Adopt the structure with Adam's product locks above.
5. `src/app/(app)/tours/[id]/budget/**` — current routes; this is what migrates
6. `src/app/(app)/budget/**` — Phase 1's placeholder; this is where content lands
7. `src/components/budget/**` — existing components (TourBudgetRebuildClient, BudgetLineSlideOver, MacroAllocationDonut, BurnRateChart, ReceiptInbox, etc.) — most carry forward
8. `database/migrations/053_deal_memos.sql`, `054_budget_line_items_section.sql`, `055_expenses_canonical.sql` — current budget schema. New migration 064 adds the phase_tag column.

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/120 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. Six commits in order: M → A → B → C → D → V.
7. **Idempotent migration.** `IF NOT EXISTS` on column add. Safe to re-run.
8. **Adam's product locks** (do not relitigate) — see the four bullets in the intro.

---

## M. Migration 064 — `budget_line_items.phase_tag` column (~15 min)

### M.1 Migration file

`database/migrations/064_budget_line_items_phase_tag.sql`:

```sql
-- ============================================
-- LOWPASS — budget_line_items.phase_tag
-- Migration 064
--
-- Adds an optional phase tag to budget line items so they can be
-- grouped/viewed by tour phase (pre-prod / rehearsals / show-days /
-- wrap) in addition to the existing category grouping.
--
-- NULL = unscoped (default). Phase grouping shows these under
-- "Unscoped" group. Category grouping ignores this column.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================

ALTER TABLE public.budget_line_items
  ADD COLUMN IF NOT EXISTS phase_tag TEXT
    CHECK (phase_tag IS NULL OR phase_tag IN ('pre_prod', 'rehearsals', 'show_days', 'wrap'));

CREATE INDEX IF NOT EXISTS budget_line_items_phase_tag_idx
  ON public.budget_line_items(tour_id, phase_tag)
  WHERE phase_tag IS NOT NULL;

COMMENT ON COLUMN public.budget_line_items.phase_tag IS
  'Optional tour-phase tag for grouping in the budget UI. Mirrors the four phases from computeTourPhases() in src/server/budget/. NULL = unscoped.';
```

### M.2 Acceptance for §M

- [ ] Migration file exists at `database/migrations/064_budget_line_items_phase_tag.sql`
- [ ] Column adds cleanly with the CHECK constraint
- [ ] Index on `(tour_id, phase_tag)` exists for performant phase-grouped queries
- [ ] Migration runs against a fresh DB (or no-op against existing DB) without error
- [ ] Adam needs to apply this in Supabase SQL editor after merge

### M.3 Commit

```
feat(migrations): 064 — budget_line_items.phase_tag column

Optional tour-phase tag (pre_prod / rehearsals / show_days / wrap)
on budget line items so they can be grouped by phase in addition
to category. NULL = unscoped. Indexed on (tour_id, phase_tag) for
the phase-grouped query path.

Adam: apply in Supabase SQL editor after merge.

Made-with: Claude Code (product split Phase 3)
```

---

## A. Route migration (~2 hr)

Move the existing `/tours/[id]/budget/*` content into `/budget/[tourId]/*` placeholders from Phase 1, wrapped in `<ProductShell>`.

### A.1 Routes

- `/tours/[id]/budget/page.tsx` → `/budget/[tourId]/page.tsx` (the full TourBudgetRebuildClient experience)
- `/tours/[id]/budget/settlement/page.tsx` → `/budget/[tourId]/settlement/page.tsx`

### A.2 Shell wrapping

Each migrated page wraps in `<ProductShell active="budget" artistId={artistId} tourId={tourId} productName="Budget">`. The shell provides:
- Left product rail (active = Budget)
- Top header with artist + tour switchers
- Scroll context

The existing `TourBreadcrumb` retires for budget pages — `<ProductHeader>` replaces it. The Phase Context strip (`<TourPhaseContextStrip>` from PR #6 Phase A) STAYS, mounted as the first child of the page body — it's the per-tour-phase context, not navigation chrome.

### A.3 Internal links audit

Find every internal link pointing to `/tours/[id]/budget/*` and update to `/budget/[id]/*`:
- `next/link` href values
- `router.push()` / `router.replace()` calls
- API routes that respond with budget URLs in JSON
- Slide-over close-and-navigate handlers

Phase 1's 301 redirects catch external misses, but in-app links should point at canonical.

### A.4 Components carry forward

These existing components stay (and inherit Phase 2's typography for free):
- `<TourBudgetRebuildClient>`
- `<BudgetLineSlideOver>`
- `<MacroAllocationDonut>`
- `<BurnRateChart>`
- `<ReceiptInbox>`
- `<DuplicateBanner>`
- `<VarianceCallout>`
- All Quick Add template wiring

Phase 3 doesn't rewrite these — only restructures the page they sit on (per §B and §C).

### A.5 Acceptance for §A

- [ ] `/budget/[tourId]` renders the budget overview inside `<ProductShell>`
- [ ] `/budget/[tourId]/settlement` renders settlement inside `<ProductShell>`
- [ ] Phase Context strip mounts at top of page body (sticky)
- [ ] All PR #6 + fix-up features still work end-to-end (line edit, Quick Add, receipts, duplicate banner, bulk select, currency switcher, export)
- [ ] Internal links throughout codebase point to new URLs
- [ ] 301 redirects from `/tours/[id]/budget/*` still resolve (Phase 1's config)
- [ ] Lint + typecheck clean

### A.6 Commit

```
feat(budget): migrate /tours/[id]/budget/* → /budget/[tourId]/*

Budget content moves into the product silo. Both overview and
settlement pages now wrap in <ProductShell> with active=budget.
TourPhaseContextStrip mounts as first child of body (sticky).
TourBreadcrumb retires; ProductHeader replaces it.

Existing components (TourBudgetRebuildClient, BudgetLineSlideOver,
MacroAllocationDonut, BurnRateChart, ReceiptInbox, etc.) carry
forward unchanged. Internal links audited and updated.

Made-with: Claude Code (product split Phase 3)
```

---

## B. Visual template per reference (~3 hr)

Apply Adam's reference HTML aesthetic to the line-item table, with his locks: keep the existing category headers (Production / Logistics / Travel / etc., NOT the reference's category list), preserve all existing features.

### B.1 Sticky stats strip (top of body)

A 40px tall horizontal strip beneath `<ProductHeader>`, sticky, dense. Mono font for numbers. Mirrors the reference HTML's strip:

```
TOTAL BUDGET: $1,500,000   COMMITTED: $850,000   SPENT: $420,000      REMAINING: $230,000   VARIANCE: -$15,000
```

Tokens:
- Background: `var(--lp-panel)` (the new `#111111` token from Phase 1)
- Border-bottom: `1px solid var(--lp-border-subtle)`
- Font: `.lp-mono`, 11px, uppercase tracking-wider for labels
- Remaining: green if positive, red if negative — uses `--lp-status-complete` / `--lp-status-rejected`
- Variance: same colour rule

This stats strip lives ABOVE the tab nav (§C) so it's always visible regardless of which tab the user is on.

### B.2 Dense line-item table

Replace the current `<TourBudgetRebuildClient>`'s table treatment with the reference HTML's dense spreadsheet style:

- **Group headers** — section dividers spanning all columns. Show category name in uppercase tracked-wide bold. Background `var(--lp-bg-deep)`, border-y `var(--lp-border-subtle)`.
- **Row treatment** — alternating subtle row backgrounds (`var(--lp-bg)` and `var(--lp-bg-deep)`), hover state lifts to `var(--lp-surface)`. Hairline `var(--lp-border-subtle)` borders between cells.
- **Selected row** — left border `2px solid var(--lp-orange)` (replaces the existing checked-row treatment).
- **Mono numerics** — Qty, Est Unit, Est Total, Actual, Variance all use `.lp-mono`. Font 11-12px (table body).
- **Variance colour** — green if under-budget (positive variance), red if over (negative).
- **Status pills** — token-driven via `--color-lp-status-*` already; carry forward unchanged.
- **Sticky thead** — already sticky from the reference; preserve.

Columns (left to right) per the reference:
- Checkbox
- # (line number — mono, muted) — NEW
- Category
- Item Description
- Vendor
- Qty (right-aligned mono)
- Est Unit (right-aligned mono)
- Est Total (right-aligned mono)
- Actual (right-aligned mono, slightly emphasized via `var(--lp-panel)` cell background)
- Variance (right-aligned mono, coloured by sign)
- Receipts (icon + count) — existing
- Status pill — existing

### B.3 Filter bar (above the table)

Sticky just below the stats strip:

- Search input (vendor / item / category)
- Filter button (status, phase tag, owner — opens existing filter slide-over)
- Columns button (toggle column visibility)
- Spacer
- Export button → existing PDF/XLSX export
- "+ Line Item" primary button (brand orange) → opens `<BudgetLineSlideOver>` in NEW mode

### B.4 Receipt Inbox

Stays as a right-side sidebar (or SlideOver on narrower viewports). Same shape as PR #6 shipped. Just visually inherits the new dense aesthetic.

### B.5 Acceptance for §B

- [ ] Sticky stats strip beneath ProductHeader: Total / Committed / Spent / Remaining / Variance, mono numerics, sign-coloured
- [ ] Dense line-item table with category group headers (using existing Lowpass categories — Production/Logistics/Travel/etc., NOT reference's list)
- [ ] Mono numerics on all numeric columns
- [ ] Variance coloured by sign
- [ ] Sticky thead, hover state, selected-row left-border accent
- [ ] Filter bar with search + Filter + Columns + Export + "+ Line Item"
- [ ] All PR #6 features (Receipt Inbox, Quick Add, duplicate banner, bulk select, multi-currency, etc.) still work
- [ ] Lint + typecheck clean

### B.6 Commit

```
feat(budget): dense spreadsheet template per Adam's reference

Applies the reference HTML aesthetic to the line-item table:
- Sticky stats strip (Total/Committed/Spent/Remaining/Variance)
  beneath ProductHeader, sign-coloured, mono numerics
- Category group headers spanning all columns (uppercase tracked
  bold) using existing Lowpass categories
- Dense table: alternating row bg, sticky thead, hairline borders,
  mono numerics throughout, variance coloured by sign
- Selected row left-border accent in brand orange
- Filter bar with search + Filter + Columns + Export + Line Item

All PR #6 features (Receipt Inbox, Quick Add, duplicate banner,
bulk select, multi-currency, export) preserved unchanged.

Made-with: Claude Code (product split Phase 3)
```

---

## C. Summary tab (~3 hr)

Tab nav at the top of the budget product separates the big-picture overview from the line-item grind.

### C.1 Tab nav

Inside `<ProductShell>`'s body, between the stats strip and the page content:

```
[ Summary | Budget | Actuals | Reports | Settings ]
```

Rendered as horizontal tabs with brand-orange active underline, muted inactive labels. Match the reference HTML's tab treatment.

Tab routing:
- Summary → `/budget/[tourId]?tab=summary` (default — empty `tab` param also lands here)
- Budget → `/budget/[tourId]?tab=budget` (line items — current Phase A content)
- Actuals → `/budget/[tourId]?tab=actuals` (placeholder — filtered view of paid/closed items, ship as stub for now with a "Coming soon" note)
- Reports → `/budget/[tourId]?tab=reports` (placeholder — custom reports surface; for now, link to the existing PDF/XLSX export flow)
- Settings → `/budget/[tourId]?tab=settings` (budget settings — categories, currency, contingency %, etc.; placeholder if no existing UI for this)

Use `searchParams` for the tab state so the URL stays bookmarkable and back-button works.

### C.2 Summary tab content

This is where the big-picture stuff lives. Layout:

1. **Phase Context Strip** — already mounted in §A. Stays at the top.
2. **Macro Allocation donut** + **Burn Rate chart** — two-up panel. Already exist from PR #6. Move them HERE from the line-item view (§B's Budget tab no longer renders them — Summary owns them).
3. **Variance summary card** — total variance, top three over-budget categories, top three under-budget. Click a category → routes to Budget tab pre-filtered to that category.
4. **Top spend categories** — sorted bar list of categories by spend, with progress bars showing actual vs estimate.
5. **Recent activity** — last 5 line-item changes (similar to Phase 1's Home recent activity, scoped to this budget).

### C.3 Budget tab content

The dense line-item table + filter bar + Receipt Inbox sidebar from §B. NO charts here — they're on Summary.

### C.4 Acceptance for §C

- [ ] Tab nav renders below stats strip with five tabs (Summary / Budget / Actuals / Reports / Settings)
- [ ] Active tab tracked via `?tab=` searchParam, brand-orange active underline
- [ ] Default tab is Summary (empty searchParam lands there)
- [ ] Summary tab renders: Phase Context strip, MacroAllocation donut, BurnRate chart, variance summary card, top spend categories, recent activity
- [ ] Budget tab renders: dense table from §B (no charts, no big-picture chrome)
- [ ] Actuals / Reports / Settings tabs are placeholders with "Coming soon" or link to existing alternatives
- [ ] Tab state persists across reload via URL
- [ ] Lint + typecheck clean

### C.5 Commit

```
feat(budget): Summary tab — big-picture overview separated from line items

Five-tab nav (Summary / Budget / Actuals / Reports / Settings) at the
top of the budget product. Tab state via ?tab= searchParam.

Summary tab is the big-picture surface: Phase Context strip,
MacroAllocation donut, BurnRate chart, variance summary card, top
spend categories, recent activity feed (last 5 changes).

Budget tab is now uncluttered — just the dense line-item table from
§B, the filter bar, and the Receipt Inbox sidebar. Charts retire from
this view.

Actuals / Reports / Settings are placeholders for follow-up sprints.

Made-with: Claude Code (product split Phase 3)
```

---

## D. Phase tagging + grouping toggle (~2 hr)

Wire the new `budget_line_items.phase_tag` column into the UI.

### D.1 BudgetLineSlideOver — add Phase field

Existing slide-over gets a new field between Category and Quantity:

```
PHASE  [ Unscoped ▾ ]
       [ Pre-prod  ]
       [ Rehearsals ]
       [ Show days ]
       [ Wrap      ]
```

Standard `<select>` styled as the rest of the slide-over fields. Maps to the migration 064 enum (NULL / 'pre_prod' / 'rehearsals' / 'show_days' / 'wrap'). Save fires the same auto-save flow as other fields.

### D.2 Grouping toggle (above the line-item table)

In the Budget tab, add a small grouping toggle next to the filter bar:

```
GROUP BY:  [ Category ]  [ Phase ]
```

Two-button toggle. Default to Category (matches existing behaviour). Switching to Phase regroups rows under: Pre-prod / Rehearsals / Show days / Wrap / Unscoped. Same group-header treatment as Category grouping.

Persist the user's choice in localStorage scoped to the tour (so each tour can have its own preference).

### D.3 Phase tag chip in row display

In the line-item rows, add a tiny phase tag chip alongside the Category column or as a new column (your call — recommend new column to the right of Category). Shows the tag if set, dash if NULL. Tokenised colours per phase:

- Pre-prod: blue tint
- Rehearsals: amber tint
- Show days: brand orange tint
- Wrap: muted gray

Use `color-mix(in srgb, <token> 12%, transparent)` for backgrounds.

### D.4 Acceptance for §D

- [ ] BudgetLineSlideOver has a Phase dropdown that saves to `phase_tag` column
- [ ] Existing line items default to "Unscoped" if no phase_tag set
- [ ] "Group by" toggle in the Budget tab switches between Category and Phase grouping
- [ ] Phase grouping shows correct groups (Pre-prod / Rehearsals / Show days / Wrap / Unscoped)
- [ ] Phase tag chip renders in each row when set
- [ ] User's grouping choice persists via localStorage
- [ ] Lint + typecheck clean

### D.5 Commit

```
feat(budget): phase tagging + grouping toggle

Wires migration 064's phase_tag column into the UI:
- BudgetLineSlideOver gets a Phase dropdown field (Unscoped /
  Pre-prod / Rehearsals / Show days / Wrap)
- "Group by Category | Phase" toggle in the Budget tab; user's
  choice persists per tour via localStorage
- Phase tag chip in rows when set, with tokenised tints per phase
- Phase grouping shows: Pre-prod / Rehearsals / Show days / Wrap /
  Unscoped sections

Made-with: Claude Code (product split Phase 3)
```

---

## V. Verify (~30 min)

### V.1 Migration

1. Apply Migration 064 in Supabase SQL editor. Verify `budget_line_items.phase_tag` column exists with the CHECK constraint.

### V.2 Route migration (A)

2. Visit `/budget/[any-tour-id]` — renders inside `<ProductShell>`. Stats strip + tab nav visible.
3. Existing line-item table works (edit, Quick Add, receipts, duplicate detection, bulk select, currency switcher, export).
4. `/budget/[id]/settlement` renders inside ProductShell.
5. Hit old URL `/tours/[id]/budget` → 301 to `/budget/[id]` cleanly.

### V.3 Visual template (B)

6. Stats strip: Total/Committed/Spent/Remaining/Variance with mono numerics, sign-coloured.
7. Line-item table: dense layout, category group headers with existing Lowpass categories (Production/Logistics/Travel/etc.), hairline borders, sticky thead, hover state, selected-row left-border accent.
8. Filter bar: search + Filter + Columns + Export + "+ Line Item" all wired.

### V.4 Summary tab (C)

9. Land on `/budget/[tourId]` — defaults to Summary tab.
10. Summary content: Phase Context strip, MacroAllocation donut, BurnRate chart, variance summary, top spend categories, recent activity.
11. Click Budget tab → switches to line-item view, no charts.
12. Click Actuals/Reports/Settings → placeholders render cleanly.
13. URL updates to `?tab=...`. Reload preserves tab.

### V.5 Phase tagging (D)

14. Open a line item's slide-over → Phase dropdown present, saves correctly.
15. "Group by Phase" toggle → table regroups under Pre-prod / Rehearsals / Show days / Wrap / Unscoped.
16. Phase tag chip renders in row display.
17. Reload → grouping choice persists.

### V.6 No regressions

18. Lint + typecheck clean. `next build --webpack` succeeds.
19. Advance product (Phase 2) still works at `/advance/[id]/*`.
20. Operations placeholder still renders.

---

## When done

```
Product Split Phase 3 done.
Commits: <M-sha>, <A-sha>, <B-sha>, <C-sha>, <D-sha>.
- M: Migration 064 — budget_line_items.phase_tag column with
  CHECK constraint (NULL / pre_prod / rehearsals / show_days /
  wrap). Adam: apply in Supabase after merge.
- A: /tours/[id]/budget/* migrated to /budget/[tourId]/*. Wraps
  in <ProductShell>. TourPhaseContextStrip stays at top of body.
  TourBreadcrumb retires.
- B: Dense spreadsheet template per Adam's reference HTML —
  sticky stats strip, category group headers (existing Lowpass
  categories), hairline borders, mono numerics, sign-coloured
  variance, selected-row brand-orange accent. All PR #6 features
  preserved.
- C: Summary tab — five-tab nav, Summary owns the big-picture
  view (Phase Context + charts + variance + top categories +
  activity). Budget tab is now uncluttered line items only.
  Actuals/Reports/Settings as placeholders.
- D: Phase tagging — BudgetLineSlideOver has Phase dropdown,
  Group-by Category|Phase toggle on Budget tab, phase chip
  in row display, choice persists per-tour via localStorage.
- Lint + typecheck clean. Built via next build --webpack.
- Phase 4 (Operations migration) is the remaining product silo;
  ships independently of this one.
```

If any of D's UX decisions feel off when CC builds them (e.g. the Group-by toggle position, the chip column placement), surface in the report and we'll iterate. Don't break the substance to apply the style.
