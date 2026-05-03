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
