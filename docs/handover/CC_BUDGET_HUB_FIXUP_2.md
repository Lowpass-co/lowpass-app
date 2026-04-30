# Budget + Tour Hub Fix-Up Round 2 — Make Saves Actually Work + Visual Cleanup

> Smoke testing of the previous fix-up sprint surfaced three classes of remaining bugs: **save handlers don't actually save** (line item numbers + status, Quick Add new items don't refresh into the table, receipt upload hits RLS), **visual sizing still broken** (Burn Rate + Macro Allocation huge despite the prior "fix"), and **Tour Hub polish missing** (no Switch tour pill, tour selector dropdown is ugly, the 2px orange borders are too loud). Three phases, three commits on PR #6's branch.
>
> **This is the final UX-polish round on the budget area.** After this lands, Adam pivots to user-flow redesign and then to making the actual functions of the app work (advance, rooming, etc. that don't function today). No more "smoke → fix → smoke" cycles after this.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/CC_BUDGET_REDESIGN_FIXUP.md` — the previous fix-up; the bugs below are what slipped through that sprint's verification
3. `src/components/budget/BudgetLineSlideOver.tsx` — line edit slide-over; numbers + status don't persist
4. `src/components/budget/TourBudgetRebuildClient.tsx` (or wherever Quick Add wires) — saves create rows but the table doesn't refresh
5. `src/app/api/budget/receipts/upload/route.ts` (or similar) — upload path; RLS denying the insert
6. `src/components/budget/BurnRateChart.tsx` and `MacroAllocationDonut.tsx` — sizing still broken
7. `src/components/tours/TourSwitchDropdown.tsx` (built in X3) — should be the top-right pill but isn't appearing on `/tours/[id]`
8. The TopBar's "Select tour" dropdown — Adam describes the artist-scoped tour selector as "horrible menu"; needs polish (low priority but documented)

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/120 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. **All on PR #6's branch (`feat/budget-redesign`).** Three commits in order: F1 → F2 → F3.
7. **Before any work: merge main into the branch.** PR #4 (migrations 060 + 062) and PR #5 (migration 061) merged to main after this branch was created. The branch is missing those files. Run `git fetch origin && git merge origin/main` (or rebase, your call) before starting F1 so the new migration 063 lands in proper sequential order alongside 060/061/062. Resolve any conflicts before the first commit.
8. **Verify saves actually round-trip to the DB.** Don't claim a save handler works without confirming the row updates in Supabase Studio after the action. The previous sprint claimed line edit worked; it didn't.

---

## F1. Save handlers — make them actually save (~1.5 hr)

These three are the blockers. Budget is unusable without them.

### F1.1 Line edit: numbers + status don't save (only title saves)

Open `BudgetLineSlideOver.tsx`. The previous sprint's "debounced auto-save" works for the `name` field but not for `estimated_amount` / `actual_amount` / `final_amount` / `status` / other numeric/enum fields.

Likely root causes (verify):
- The save handler is wired to ONE field's onChange (probably name) instead of all fields
- Number fields' onChange isn't passing the parsed numeric value (e.g. passing the raw string from `<input type="number">` causes the API to reject)
- Status select's onChange isn't firing the save
- The PATCH endpoint accepts `name` but not the other fields (server-side validation rejects unknown keys)

Fix:
- One `useDebouncedSave` hook that wraps the entire form state object, not per-field
- Number inputs: parse to number on change before adding to state (`parseFloat(e.target.value) || 0`)
- Status select: standard onChange firing the same save handler
- Verify the PATCH endpoint at `/api/budget/lines/:id` accepts `{ name, category, estimated_amount, actual_amount, final_amount, status, currency, notes, vendor_in_notes, ... }` and updates whichever keys are present

After fix: open a row, change Estimated from 0 to 500, wait for the auto-save indicator, reload the page → value should still be 500. Same test for Actual, Status, Currency, Notes.

### F1.2 Quick Add saves a row but it doesn't appear in the table

Open `TourBudgetRebuildClient.tsx` (or wherever the Quick Add button onClick handlers live).

The flow today:
1. Click "Hotel Block" → opens BudgetLineSlideOver in NEW mode with pre-filled category
2. Type a name, save fires POST to `/api/budget/lines`
3. Server returns the new row
4. ❌ Table doesn't re-render with the new row

The likely fix: after the POST succeeds, the parent component needs to either (a) call `router.refresh()` to revalidate the server data, OR (b) push the new row into local state to render optimistically AND then revalidate.

Recommendation: do both — optimistic local state push for instant feedback + `router.refresh()` for canonical server-state sync. The slide-over closes automatically on save success (or after a 300ms confirmation flash, your call).

Same fix applies to "Freight" / "Catering" / "Local Crew" Quick Adds — they all funnel through the same NEW mode handler.

### F1.3 Receipt upload: "new row violates row-level security policy"

The route is fixed (no more HTML 404), but the underlying RLS denies the INSERT. The upload likely tries to insert into `budget_line_item_attachments` (or similar) and that table doesn't have a permissive INSERT policy for the user.

Run this SQL in Supabase to find the table the upload writes to and its policies:

```sql
-- Find tables related to budget receipts
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND (
  table_name LIKE '%receipt%' OR
  table_name LIKE '%attachment%' OR
  table_name LIKE 'budget%'
)
ORDER BY table_name;

-- For each: list policies (replace TABLE_NAME)
SELECT polname, polcmd::text AS operation,
  pg_get_expr(polqual, polrelid) AS using_clause,
  pg_get_expr(polwithcheck, polrelid) AS with_check_clause
FROM pg_policy
WHERE polrelid = 'public.TABLE_NAME'::regclass
ORDER BY polcmd;
```

Whichever table the upload INSERTs into needs a workspace-membership-only INSERT policy matching the canonical pattern from migration 061. If a policy exists but is wrong, the previous RLS audit must have missed it — surface in the report.

Likely fix is just one DROP/CREATE POLICY pair on `budget_line_item_attachments` (or similar). Apply via direct SQL paste **AND** add a `063_budget_receipts_rls_fix.sql` migration file so the repo stays in sync with the live DB. Keep the migration idempotent (DROP IF EXISTS + CREATE).

If the route uses Supabase Storage (not a regular table) for the file blob and a different table for metadata, both need policies — Storage bucket needs an INSERT policy on `storage.objects`, metadata table needs RLS.

### F1.4 Acceptance

- [ ] Open a budget row, change Estimated from 0 to 500, wait for save indicator, reload — value persists
- [ ] Same for Actual, Final, Status, Currency, Notes, Category (when Category is a dropdown — see F2 below)
- [ ] Click Hotel Block Quick Add, save a new row → row appears in the table immediately AND persists after reload
- [ ] Same for Freight, Catering, Local Crew Quick Adds
- [ ] Drag a PDF into Receipt Inbox → upload succeeds, no RLS error, file metadata saved
- [ ] Lint + typecheck clean

### F1.5 Commit

```
fix(budget): line edit save, Quick Add table refresh, receipt upload RLS

Three save-handler bugs that made the budget area non-functional
after the prior fix-up sprint:

- BudgetLineSlideOver: only the name field's onChange was wired to
  the debounced save. Numbers + status + currency + notes never
  persisted. Refactored to wrap the entire form state in one
  useDebouncedSave hook. Verified all field types round-trip via
  PATCH /api/budget/lines/:id.
- Quick Add Hotel Block (et al): POST succeeded but the parent
  component didn't refresh the table data. Added optimistic local
  state push + router.refresh() so the new row appears instantly.
- Receipt upload was hitting RLS denial on
  [budget_line_item_attachments / storage.objects / etc]. Added
  workspace-membership INSERT policy via migration 063. Captured
  as a tracked migration file so codebase and live DB stay in sync.

Made-with: Claude Code (budget hub fix-up round 2)
```

---

## F2. Visual fixes — chart/donut sizing for real this time + slide-over polish (~1 hr)

### F2.1 Burn Rate chart still huge

The previous sprint added "bar width capped + viewBox sized to data so 1-bucket datasets don't paint a giant block." Adam's screenshot still shows a massive single orange bar dominating the chart area.

Re-open `BurnRateChart.tsx`. The root issue is probably:
- The viewBox and the parent container have mismatched aspect ratios
- The chart's parent container is `min-height: 400px` or similar, forcing the chart to fill it regardless of data shape
- A single-bar dataset (the user has only one budget item, so only one day has spend) genuinely renders a tall bar — but it should be capped to a sensible MAX height

Fix:
- Constrain the parent container to `max-height: 200px` for the chart (the variant designs all show short, wide bar charts — not tall thin ones)
- Ensure the chart fills width but caps height
- For sparse data (1-2 bars), pad the X-axis with empty bucket positions so the visible bars are proportional to the tour duration, not "one bar fills the whole frame"
- Bar width should be: `min(40px, containerWidth / bucketCount)` — caps wide bars at 40px so single-day spend doesn't render as a massive block

### F2.2 Macro Allocation donut still huge

Previous sprint claimed "donut now scales with its column (max-w-280px aspect 1:1)." Adam's screenshot shows a still-huge donut.

Likely issues:
- The `max-w-280px` is on the wrong element (parent vs. child)
- The aspect-1:1 wrapper doesn't have a constraint on its parent
- The legend is rendering INSIDE the donut wrapper, causing the donut to grow to accommodate

Fix:
- Donut SVG itself: explicit `width: 200px; height: 200px` (not max-width)
- Parent container: `display: flex; flex-direction: column; align-items: center; gap: var(--lp-space-3)`
- Legend below the donut, separate flex item, `width: 100%`
- Center label inside the donut sized appropriately (var(--lp-text-2xl) for the total, var(--lp-text-xs) for "TOTAL SPENT")

Verify by opening the page — the donut should be ~200px tall, with the legend sitting cleanly below it. No massive whitespace.

### F2.3 Slide-over: remove duplicate title

Adam's screenshot of the slide-over shows the line item name displayed TWICE — once as the slide-over header ("Backline Rental") and once as the ITEM input field below ("Backline Rental"). Redundant.

Fix:
- Remove the slide-over header title text
- Make the ITEM input field the canonical title — let user edit it directly
- Slide-over header keeps the close button but loses the "{name} · category · $0" title row
- OR: keep the header as the canonical display + remove the ITEM input field, AND make the header title editable in-place (click to edit)

Recommendation: second option (header is editable in-place). Less form chrome, more direct.

### F2.4 Category should be a dropdown, not free text

Currently the slide-over shows "CATEGORY" as a text input with raw values like `prod_misc`. It should be a dropdown of the canonical budget categories.

Find or define the category list. Likely existing somewhere as an enum or in `BUDGET_CATEGORIES` constant — grep for it. If it doesn't exist, define:

```ts
export const BUDGET_CATEGORIES = [
  { key: 'production', label: 'Production' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'travel', label: 'Travel' },
  { key: 'crew', label: 'Crew' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'catering', label: 'Catering' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'contingency', label: 'Contingency' },
] as const;
```

(Adjust the actual list to match what the budget data actually uses — read existing rows to see.)

The CATEGORY field in the slide-over becomes a `<select>` populated from this list. Save fires the same auto-save flow.

**Adam's stretch ask: changing category should relocate the row to the correct budget section.** This is bigger than a fix-up — it implies the budget table groups rows by category. Today the table shows a flat list. Promoting category to a grouping pivot is a UX24-ish pass. **Defer this** unless the table already groups; flag in commit message.

### F2.5 Tour Hub: orange borders too loud

Adam: "the orange borders here can go. the highlighting can be much more subtle."

Find `TourPrimaryCTACard.tsx` (the Advance + Budget cards on `/tours/[id]`). Currently `border: 2px solid var(--lp-orange)`. Soften:
- Drop to `1px solid color-mix(in srgb, var(--lp-orange) 35%, var(--lp-border))`
- Background tint stays at `color-mix(in srgb, var(--lp-orange) 4%, transparent)` (already subtle)
- The CTA text "Open advance →" stays brand orange — that's the accent
- Active/hover state can intensify the border to full orange

Same softening for any 2px brand-orange borders elsewhere in the new components (the Setup chip strip's "active" state, the variant CTA cards if any, etc.). Keep the brand prominent enough to feel branded; remove the "screaming" quality.

### F2.6 Acceptance

- [ ] Burn Rate chart capped to ~200px tall, bars are proportional to data
- [ ] Macro Allocation donut sized to ~200px, legend below it, no massive whitespace
- [ ] Slide-over has only ONE title (in-place editable header OR ITEM input — not both)
- [ ] Category is a dropdown with predefined options
- [ ] Tour Hub primary CTA cards have softer borders (1px tinted, not 2px solid orange)
- [ ] Lint + typecheck clean

### F2.7 Commit

```
fix(budget): chart sizing, donut sizing, slide-over title, category dropdown, softer orange borders

Visual cleanup pass after the second smoke surfaced that the
prior "fix" didn't actually fix sizing:

- BurnRateChart: capped parent container max-height: 200px; bars
  cap at 40px width; sparse-data datasets pad X-axis with empty
  buckets so single-day spend doesn't render as a giant block.
- MacroAllocationDonut: explicit 200×200 donut, legend below as
  separate flex item.
- BudgetLineSlideOver: removed duplicate title — header is now the
  in-place-editable canonical title; dropped the redundant ITEM
  input.
- CATEGORY field promoted from free text to a dropdown over the
  canonical BUDGET_CATEGORIES list.
- TourPrimaryCTACard borders softened from 2px solid var(--lp-orange)
  to 1px tinted (35% mix with --lp-border). Hover/active intensifies.

Adam's stretch ask — "changing category relocates the row to the
correct budget section" — deferred. Today the budget table is a flat
list; row grouping by category is a separate UX pass, not a fix-up.

Made-with: Claude Code (budget hub fix-up round 2)
```

---

## F3. Tour Hub: Switch tour pill + tour-selector polish (~30 min)

### F3.1 Switch tour pill missing from /tours/[id]

The X3 commit was supposed to render `<TourSwitchDropdown>` in the top-right of the Tour Hub. Adam's screenshot shows it isn't there. The component file exists; it's just not mounted on the page.

Open `src/app/(app)/tours/[id]/page.tsx`. Find where the breadcrumb (`← Artist name`) is rendered. The Switch tour pill goes RIGHT-aligned in the same row:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <Link href={`/artists/${artistId}`}>← {artistName}</Link>
  <TourSwitchDropdown
    currentTourId={tourId}
    artistId={artistId}
    tours={artistTours}
  />
</div>
```

Make sure `getTourHubData()` fetches `artistTours` (the list of tours for this artist excluding the current one) and passes it through.

### F3.2 Top-left tour selector "horrible menu"

The TopBar's "Select tour" dropdown shows tours filtered by selected artist (the artist scope from the nav redesign). When the user clicks it, the rendered menu is described as "horrible." Without seeing it I can't precisely diagnose, but likely issues:

- Cramped spacing
- No artist sub-headers (everything blended together)
- Inconsistent typography with the rest of the app
- Text wrapping ugly on long tour names

Find the component (probably `src/components/shell/TopBarTourSelector.tsx` or similar — grep for "Select tour"). Apply standard Lowpass dropdown styling:
- Each row: `padding: var(--lp-space-2) var(--lp-space-3)` minimum
- Hover state: `background: var(--lp-surface-hover)` (or `--lp-bg-secondary`)
- Active/selected: `background: color-mix(in srgb, var(--lp-orange) 10%, transparent)`
- Typography: `var(--lp-text-sm)` for tour name, `var(--lp-text-xs) var(--lp-text-tertiary)` for date range below
- If the dropdown is grouping by artist (the nav redesign's intent), artist names render as small uppercase tracking-wide section headers
- Max width: 320px so long tour names truncate cleanly with ellipsis

Take a screenshot before and after for the commit message.

### F3.3 Acceptance

- [ ] `/tours/[id]` shows the Switch tour pill in the top-right of the breadcrumb row
- [ ] Click the pill → dropdown lists this artist's other tours; click a tour switches
- [ ] TopBar's "Select tour" dropdown has clean spacing, hover states, artist sub-headers (if multi-artist), proper typography
- [ ] Lint + typecheck clean

### F3.4 Commit

```
fix(tours): mount Switch tour pill on hub + polish TopBar tour selector

X3 built TourSwitchDropdown but it was never mounted on
/tours/[id]/page.tsx. Mounted now in the breadcrumb row, right-
aligned.

TopBar's Select tour dropdown polished: standard hover/active
states using --lp-surface-hover and brand-orange tint, artist
sub-headers when multi-artist, typography matched to other Lowpass
dropdowns, max-width with ellipsis truncation for long tour names.

Made-with: Claude Code (budget hub fix-up round 2)
```

---

## V. Verify (~15 min)

Run all of these. If anything fails, fix on the same branch.

### V.1 Saves actually save

1. Open any budget row. Change Estimated to 500. Wait. Reload. Value is 500.
2. Same for Actual, Status (change Draft → Pending), Currency, Notes.
3. Quick Add Hotel Block. Save. Row appears in the table immediately. Reload. Row still there.
4. Drag a PDF into Receipt Inbox. Upload succeeds. No RLS error.

### V.2 Visual

5. Burn Rate chart: capped height (~200px), bars proportional to data (single-day spend doesn't render as a giant block).
6. Macro Allocation: donut sized ~200px, legend cleanly below.
7. Open a row's slide-over: title appears ONCE (no duplicate header + ITEM field).
8. CATEGORY field is a dropdown.
9. Tour Hub primary CTA cards have softer (1px tinted) borders, not loud 2px solid orange.

### V.3 Tour Hub

10. `/tours/[id]` has Switch tour pill top-right of the breadcrumb.
11. Click it → dropdown of this artist's other tours.
12. TopBar's Select tour dropdown looks polished — spacing, hover, artist groupings.

### V.4 No regressions

13. Lint clean (75/120 baseline). Typecheck zero. `next build --webpack` succeeds.
14. Other pages unaffected: `/tours/[id]/advance`, `/tours/[id]/routing`, `/artists/[id]` still work.

---

## When done

```
Budget + Tour Hub fix-up round 2 done.
Commits: <F1-sha>, <F2-sha>, <F3-sha>.
- F1: line edit numbers/status/currency/notes save; Quick Add
  refreshes table; receipt upload RLS fixed via migration 063.
- F2: chart + donut sized correctly; slide-over title de-duped;
  category is a dropdown; Tour Hub borders softened.
- F3: Switch tour pill mounted on hub; TopBar tour selector
  polished.
- Lint + typecheck clean. Built via next build --webpack. PR #6
  ready for final review and merge.
```

---

## After this lands

Adam's strategic shift: pivot from "UX polish" to "user-flow redesign + functional bug-fixing." The next sprint after this isn't another UX prompt — it's whatever the highest-priority broken feature is. Don't write further UX-polish prompts on top of this one unless Adam specifically asks; the next ask will be about flows and functionality, not visual refinement.
