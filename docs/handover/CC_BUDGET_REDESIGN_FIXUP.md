# Budget Redesign + Tour Hub Fix-Up

> Smoke testing of PR #6 (budget redesign) surfaced eight critical bugs in the budget area itself, AND revealed that PR #3's Tour Hub redesign (Phase C) never properly shipped — the page Adam sees at `/tours/[id]` is the legacy layout with a left-rail of tabs, no breadcrumb, no Setup chip strip, no big CTAs. Phase N hygiene items from the budget prompt were skipped because CC believed PR #3 contained them; it did not.
>
> This prompt is a single fix-up sprint on PR #6's branch. Four phases. Don't re-open new PRs — this all lands as commits on `feat/budget-redesign` so the sprint ships as one merge.

---

## 0. Required reading

1. `CLAUDE.md`
2. `docs/handover/CC_BUDGET_REDESIGN.md` — the original prompt; phases A-F shipped, but bugs and missing scope to fix here
3. `docs/handover/CC_NAV_ARTIST_TOUR_WORK.md` — particularly **Phase C (Tour Hub)** which never shipped despite PR #3 claiming it did
4. **Verify what's actually on `/tours/[id]` today** — open it, screenshot it, confirm what's there vs. what the Phase C spec says should be there. Don't trust prior claims.
5. The eight smoke findings from Adam (summarised in §F1, §F2 below)
6. `src/app/(app)/tours/[id]/page.tsx` — the actual Tour Hub entry route. Verify what it renders; this is what Phase X3 has to fix.
7. `src/components/budget/BudgetLineSlideOver.tsx` — verify whether the form fields + save action actually work
8. `src/app/api/budget/receipts/**` — find the upload route that's returning HTML 404; fix the routing
9. `src/components/budget/MacroAllocationDonut.tsx` and `BurnRateChart.tsx` — both have visual bugs to fix
10. `src/components/budget/_legacy/` (or wherever CC moved the old tabs) — confirm the imports were actually removed from the running budget page

---

## 1. Hard rules

1. No new dependencies.
2. All visual values via `var(--lp-…)` tokens. Brand orange transparent variants must be hex+alpha (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concat.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/120 baseline per PR #6's verification numbers). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. **All on PR #6's branch (`feat/budget-redesign`).** Don't open new PRs. Push commits sequentially.
7. **Verify before claiming.** PR #6's previous claim that Phase N shipped in PR #3 was wrong. For every "this should already exist" assumption — open the file, confirm. Document confirmed vs. assumed in the commit message if the answer surprises you.
8. Four commits in order: X1 → X2 → X3 → X4. Plus a verification report (no commit).

---

## X1. Budget critical bugs — make it actually usable (~2 hr)

These four bugs make the budget page non-functional today. Highest priority.

### X1.1 Line items not editable

Adam reports that opening a budget row's slide-over shows the row but **none of the line item fields are editable** — no input fields, or inputs render but don't save, or the slide-over is read-only when it should be edit-mode.

Check `src/components/budget/BudgetLineSlideOver.tsx`:
- Are the fields actually `<input>` / `<textarea>` / `<select>` elements, or are they read-only `<div>`s?
- Is there a save button wired to a PATCH handler against `/api/budget/lines/:id` (or whatever the endpoint is)?
- Does the save handler actually fire and round-trip to the database?

If any of those is broken, fix. The slide-over should:
- Render every column from the table as an editable field (Item name, Vendor, Estimated, Actual, Final, Variance % (computed read-only), Status pill picker, Owner picker, Notes textarea)
- Save on blur OR on an explicit "Save" button (your call — debounced auto-save matches Lowpass's other slide-overs, so go with that)
- Show a saving indicator + success/error toast

### X1.2 Quick Add Hotel Block (et al) opens an empty slide-over

Adam reports clicking "Hotel Block" Quick Add at the bottom of the table opens a slide-over with **no fields, no name field, no save button**. The flow is broken end-to-end.

Phase C of the budget redesign was supposed to:
> Click → opens BudgetLineSlideOver with the template's fields pre-populated.

Find the Quick Add wiring (likely in `TourBudgetRebuildClient.tsx` or wherever the Quick Add buttons live), check what it passes to the slide-over. Two likely failure modes:
- **Mode A:** It opens the slide-over but doesn't pass any pre-fill data, so the slide-over renders in a state where nothing's wired. Pre-fill needs the template's defaults: `{ category: 'Accommodation', vendor: '', estimated: 0, status: 'draft' }` for Hotel Block, etc.
- **Mode B:** It opens a different slide-over (e.g. the legacy slide-over from `_legacy/budget`) that has no form. Wire it to use the actual `BudgetLineSlideOver` from §X1.1.

Either way: clicking Hotel Block should pre-populate `category = 'Accommodation'` (and vendor blank, estimated/actual blank, status `draft`), the slide-over should be in NEW mode (saving creates a new row, not updates), the save handler should POST to `/api/budget/lines` (or whatever the create endpoint is).

Same fix applies to Freight, Catering, Local Crew Quick Adds.

### X1.3 Receipt upload returns 404 HTML

Adam dragged a file into the Receipt Inbox and got the entire HTML 404 page back as response (not a JSON error — actual HTML). That means either:
- The upload endpoint doesn't exist at the URL the client posts to
- The endpoint exists but is at a different route
- Next.js is serving the not-found page because the route file is misplaced

Find the upload route. Most likely paths:
- `src/app/api/budget/receipts/route.ts` (POST)
- `src/app/api/budget/receipts/upload/route.ts` (POST)

If the client is posting to a path that doesn't have a `route.ts`, fix the client URL OR move/create the route file. Confirm by curling the endpoint manually after the fix:

```bash
curl -X POST -F "file=@some.pdf" https://localhost:3000/api/budget/receipts -H "Content-Type: multipart/form-data"
```

Should return JSON, not HTML.

While you're there: confirm the existing OCR backend route (`/api/budget/receipts/ocr` per CC's audit) is reachable but gated behind the `NEXT_PUBLIC_RECEIPT_OCR_ENABLED` flag from Phase D. Don't accidentally turn it on.

### X1.4 Legacy budget workspace still rendering

Adam's screenshot shows the **OLD "Budget workspace" with the SECTIONS rail (Income / Expenses / Hotels / Travel / Gear hire / Payroll / Per diems / Other / Summary) STILL RENDERING below the new budget content.** CC moved the legacy tab files to `src/_legacy/budget/` but didn't remove the rendering from the page. The page is now doubled up — new design on top, old design below.

Find what's rendering the old layout:
- Open `src/app/(app)/tours/[id]/budget/page.tsx`
- Find the import that pulls in the legacy "Budget workspace" / Sections rail / Income+Expenses tables
- Remove that import and its render
- Verify by reloading the page — only the new design should be visible

Likely culprits to grep for:
- `BudgetFolderTabsNav`
- `IncomeTab` / `ExpensesTab` / `HotelsTab` etc.
- "Budget workspace" string in the codebase
- Anything that imports from `_legacy/budget`

If the legacy code is just no longer imported, the file moves were correct — the imports just weren't cleared. Delete the imports.

If something IS still importing from the legacy directory, either move that something to use the new primitives OR keep the import and rename the legacy folder to `_legacy_budget_kept_for_X` with a comment explaining what's still using it.

### X1.5 Acceptance

- [ ] Click any budget row → slide-over opens with editable fields → edit any field → save persists across reload
- [ ] Quick Add Hotel Block → slide-over opens pre-filled with `category = Accommodation` and blank vendor → fill in name, save → row appears in the table with status `draft`
- [ ] Same for Freight / Catering / Local Crew Quick Adds
- [ ] Drag a PDF/JPG into the Receipt Inbox → upload succeeds, file appears in the inbox list
- [ ] `/tours/[id]/budget` shows ONLY the new design — no SECTIONS rail, no Income/Expenses tabs, no "Budget workspace" heading from the legacy layout
- [ ] No lint/type regressions

### X1.6 Commit

```
fix(budget): line item edit, Quick Add pre-fill, receipt upload, retire legacy tabs from page

Four critical bugs surfaced in PR #6's smoke:

- BudgetLineSlideOver: fields were [describe what was broken — read-only
  divs / not wired to save / etc.] Now renders editable fields with
  debounced auto-save against /api/budget/lines/:id.
- Quick Add Hotel Block (and Freight / Catering / Local Crew): opened
  an empty slide-over. Now pre-fills category + opens slide-over in
  NEW mode, save POSTs to /api/budget/lines.
- Receipt upload route was returning HTML 404 because [describe what
  was wrong — route didn't exist / wrong path / etc.] Now correctly
  routes to /api/budget/receipts and returns JSON.
- Legacy "Budget workspace" was still rendering on /tours/[id]/budget
  because the page kept importing the legacy components even after
  Phase C of the original sprint moved the files to _legacy/. Removed
  the imports; the legacy layout is no longer visible.

Made-with: Claude Code (budget redesign fix-up)
```

---

## X2. Budget visual fixes (~1 hr)

### X2.1 Burn Rate chart — one giant orange block

Adam's screenshot shows the Burn Rate chart rendering as a SINGLE giant orange rectangle filling the entire chart area. Should be a series of small bars per day, with phase boundaries marked.

`src/components/budget/BurnRateChart.tsx` — almost certainly an SVG sizing or data-iteration bug. Likely fixes:
- The bars iterate over `daily_spend` data correctly but the `width` attribute on each `<rect>` is set to the CONTAINER width instead of `containerWidth / dayCount`
- Or the data shape is `{ total: 600 }` (single bar) instead of `[{ date: 'd1', amount: 100 }, ...]` and the chart is dumb-rendering the total
- Or `viewBox` is wrong and one bar is overflowing

Open the file, find the bug, fix. The chart should render N bars where N is the number of days in the tour (or weeks if the tour is >60 days, auto-bucket).

### X2.2 Macro Allocation donut — tiny donut in giant empty space

Adam's screenshot shows a small donut centered in a massive empty container.

`src/components/budget/MacroAllocationDonut.tsx` — likely fixes:
- The donut's parent has `min-height: 400px` or similar but the donut itself has a fixed pixel size
- Or the SVG `viewBox` doesn't match the rendered container
- Or there's a container wrapper that's stretched and ignored by the SVG

Either constrain the parent container (so empty space doesn't render) OR scale the donut to fill the container. Recommended: constrain the container — the donut + legend should naturally size their parent, not the other way around.

### X2.3 Duplicate detection — didn't trigger

Adam created what should have been a duplicate and the banner didn't appear. Two possibilities:
- The detection SQL never runs (server function not wired into the page data fetch)
- The detection runs but the threshold is too tight (vendor must be EXACT match, amount within 0.01% etc.)

Open `src/server/budget/detectDuplicates.ts`. Verify:
- It actually runs as part of `getTourBudgetData()` (or whatever the page's data hook is)
- The thresholds are reasonable: same `vendor` (exact match), `amount` within 5%, `created_at` within 7 days
- The result is passed to the table and banners render on matched rows

If it's wired but Adam's test items just didn't match, document the threshold in the audit report and tell Adam to retest with closer values. Don't loosen the thresholds without confirming with Adam — false-positive duplicate banners are worse than no banners.

### X2.4 Acceptance

- [ ] Burn Rate chart shows N bars (one per day, or one per week if auto-bucketed) with phase boundaries marked
- [ ] Macro Allocation donut + legend fill their container without massive whitespace
- [ ] Duplicate detection wires into the page data fetch; thresholds documented
- [ ] No lint/type regressions

### X2.5 Commit

```
fix(budget): Burn Rate sizing, Macro Allocation layout, duplicate detection wiring

Three visual / wiring bugs:
- BurnRateChart was rendering a single giant bar because [describe
  the actual root cause]. Now iterates N daily bars with phase
  boundaries.
- MacroAllocationDonut + legend were tiny in a 400px container.
  Container now sizes to content.
- detectDuplicates() wasn't wired into getTourBudgetData() / the
  page data fetch. Now runs server-side; banners render on matched
  rows. Thresholds: vendor exact, amount within 5%, created_at
  within 7 days.

Made-with: Claude Code (budget redesign fix-up)
```

---

## X3. Tour Hub redesign — actually ship it this time (~3 hr)

PR #3 Phase C never delivered. The page at `/tours/[id]` today shows a legacy layout with a left-rail of tabs, generic chips ("2 shows · 1 personnel · $11K"), and a calendar grid. The spec called for a breadcrumb, Setup chip strip, two big CTA cards, Switch tour pill, secondary cards.

### X3.1 Audit current state first

Open `src/app/(app)/tours/[id]/page.tsx` AND any related files (`OverviewTab.tsx`, `TourOverview.tsx`, etc.). Document what's actually rendering today. Look for:
- A `<TourBreadcrumb>` import — does the file exist? Is it mounted?
- A `<SetupStatusStrip>` or `<SetupChipStrip>` import — does the component exist?
- A `<TourPrimaryCTACard>` import — does the component exist?
- The legacy Overview/Routing/Advance/Budget tabs structure — is that a left-rail variant? Where's it defined?

Three possibilities:
- (A) The components from PR #3 spec exist as files but aren't mounted on the page → mount them
- (B) The components exist but are buggy → fix them, mount them
- (C) The components don't exist at all → build them per the original Phase C spec

Document which is true in the commit message before fixing.

### X3.2 Per the original PR #3 Phase C spec (re-stated for clarity)

`/tours/[id]/page.tsx` should render, top to bottom:

1. **Breadcrumb** at the very top: `← [Artist name]` link → `/artists/[artist-id]`. Right side: `Switch tour ▾` dropdown (lists this artist's tours, click → `/tours/[other-id]`).

2. **Hero**: tour name as H1 (`var(--lp-text-2xl)` weight 500), status pill (Active / Completed / Planning) using `--color-lp-status-*` tokens, sub-line "Date range · Artist name".

3. **Setup chip strip**: heading "SETUP · BUILD-ONCE" (uppercase, tracking-wider, tertiary text). Five chips: Routing / Channel list / Personnel / Rooming / Riders linked. Each shows ✓ green / — gray / ↗ orange (for riders linked count). Clickable to the respective page. **Channel list chip queries `channel_list_rows` directly, NOT a rider_packs proxy.** (This is the Phase N fix from the original budget prompt — fold it in here.)

4. **Two big CTA cards** (`grid-template-columns: 1fr 1fr`):
   - **Advance**: 2px brand-orange border, `color-mix(in srgb, var(--lp-orange) 4%, transparent)` background. Label "Advance", big metric "X / Y" (shows complete / total), sub-line with %, progress bar (brand orange fill), CTA "Open advance →" to `/tours/[id]/advance`.
   - **Budget**: same shape. Label "Budget", big metric "£X / £Y", sub-line "% of estimate", progress bar (`--color-lp-status-complete` green when on-budget, amber >80%, red >100%), CTA "Open budget →" to `/tours/[id]/budget`.

5. **Tour timeline**: existing TimelineDashboard from UX16, demoted to secondary section. Heading "TIMELINE", wrapped in a card with `var(--lp-bg-secondary)` background.

6. **Secondary cards** (`grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`): Personnel · N assigned, Routing · N dates, Channel list · N inputs, Rooming · N rooms or "Not set". Each card clickable to its tour-internal page.

7. **NO LEFT-RAIL OF TABS.** The "Overview / Routing / Advance / Budget / Personnel / Rooming / Files / Channel List / Rider Packs" left-rail Adam sees today doesn't exist on the new Tour Hub. Tour-internal navigation happens via the Setup strip + CTA cards + secondary cards on the hub, not via a persistent rail.

8. **Tour-internal pages STILL get a left-rail** (the docSections variant from the nav redesign) when you've drilled INTO advance/budget/etc. — that's where the date strip / section anchors live. But the Tour Hub itself is no-rail.

### X3.3 Component inventory

Confirm or create these components (some may exist from PR #3 even if not mounted):
- `src/components/tours/TourBreadcrumb.tsx` (or `TourBreadcrumbServer.tsx` per the per-page mount pattern)
- `src/components/tours/SetupStatusStrip.tsx`
- `src/components/tours/TourPrimaryCTACard.tsx`
- `src/components/tours/TourSecondaryCard.tsx`
- `src/server/tours/getTourHubData.ts` — single async fetch for tour + artist + counts + setup status

Server data fetching:

```ts
// getTourHubData()
return {
  tour,                  // basic tour record
  artist,                // joined artist
  counts: {
    advance: { complete, total },
    budget: { spent, estimate },
    personnel,
    routingDates,
    channelListRows,
    roomingRows,
    ridersLinked,
  },
  setup: {
    routing: routingDates > 0,
    channelList: channelListRows > 0,         // queries channel_list_rows directly
    personnel: personnel > 0,
    rooming: roomingRows > 0,
    ridersLinked,                              // count, not boolean
  },
};
```

Each count uses a cheap existence query (`SELECT id FROM <table> WHERE tour_id = X LIMIT 1` for booleans, `SELECT count(*) FROM <table> WHERE tour_id = X` for numbers).

### X3.4 Acceptance

- [ ] `/tours/[id]` shows the breadcrumb at top with `← Artist name` link
- [ ] `Switch tour ▾` pill on the right; dropdown shows other tours of this artist; clicking switches
- [ ] Hero: tour name + status pill + dates
- [ ] Setup chip strip with five chips (Routing / Channel list / Personnel / Rooming / Riders linked) reflecting actual data
- [ ] Channel list chip queries `channel_list_rows` directly (verify with a test tour: riders present, no channel list → chip shows `—` gray)
- [ ] Two big orange-bordered CTA cards (Advance + Budget) showing real counts and progress
- [ ] Click Advance card → `/tours/[id]/advance` opens
- [ ] Click Budget card → `/tours/[id]/budget` opens
- [ ] Setup chips clickable to respective pages
- [ ] Timeline (existing TimelineDashboard) renders as secondary
- [ ] Four secondary cards at the bottom
- [ ] **NO left-rail of tabs on the Tour Hub itself.** (Tour-internal pages still get their docSections rail — that's separate.)
- [ ] No lint/type regressions

### X3.5 Commit

```
feat(tours): actually ship Tour Hub redesign (PR #3 Phase C never landed)

PR #3 claimed Phase C delivered the Tour Hub redesign but smoke
testing revealed /tours/[id] still shows the legacy left-rail tabs,
generic chips, and a calendar grid. Spec called for breadcrumb,
Setup chip strip, two big CTA cards, Switch tour pill, secondary
cards — none of those shipped.

[Document what was found in audit: which components existed, which
were missing, which were misnamed. Be specific so this doesn't
happen again.]

This commit ships Phase C as originally specified:
- TourBreadcrumb component, mounted at top of /tours/[id]
- Switch tour pill on right
- Hero with status pill + date range
- SetupStatusStrip with five chips. Channel list chip queries
  channel_list_rows directly (Phase N fold-in).
- Two TourPrimaryCTACard components for Advance + Budget with
  brand-orange 2px borders, real counts, progress bars
- Demoted TimelineDashboard to secondary section
- Four TourSecondaryCard components for Personnel/Routing/
  Channel list/Rooming
- Removed the legacy left-rail of tabs from the Tour Hub view.
  Tour-internal pages keep their docSections rail; only the hub
  itself drops it.

Made-with: Claude Code (budget redesign fix-up)
```

---

## X4. Phase N hygiene (~20 min)

The remaining Phase N items not folded into X3 above.

### X4.1 CLAUDE.md note

In `CLAUDE.md`'s "Critical conventions" section, add a bullet:

> **Tour-internal pages require `<TourBreadcrumbServer>` (or `<TourBreadcrumb>` — confirm naming).** Every page under `src/app/(app)/tours/[id]/**` (except the Tour Hub itself, which has its own breadcrumb in the page body) must mount the tour breadcrumb at the top of its content tree. The mount cannot live in `tours/[id]/layout.tsx` because PageShell's scroll structure puts the layout outside the sticky scroll context. See the Tour Hub redesign commit for the pattern.

### X4.2 Component JSDoc

In `src/components/tours/TourBreadcrumb.tsx` (or whatever the actual component file is named), add a top-of-file comment:

```ts
/**
 * Mount this at the TOP of every page under src/app/(app)/tours/[id]/**.
 *
 * Why per-page and not in tours/[id]/layout.tsx:
 * PageShell creates a <main overflow:auto> scroll container. A sticky
 * element mounted in the layout sits OUTSIDE that scroll context and
 * fights the TopBar's stacking. Mounted per-page (inside main), sticky
 * top:0 works as intended.
 *
 * Exception: the Tour Hub itself (src/app/(app)/tours/[id]/page.tsx)
 * mounts its breadcrumb directly as part of the hub layout — no
 * separate sticky wrapper needed.
 *
 * If you're adding a new tour-internal page and forgot to mount this,
 * the user loses the [Back to tour] escape hatch. Don't.
 */
```

### X4.3 Acceptance

- [ ] `CLAUDE.md` has the new bullet under Critical conventions
- [ ] `<TourBreadcrumb>` (or its actual name) has the JSDoc

### X4.4 Commit

```
chore(docs): TourBreadcrumb per-page mount convention documented

Adds CLAUDE.md note + component JSDoc explaining why
TourBreadcrumb mounts per-page rather than in tours/[id]/layout.tsx.
PageShell's scroll structure means a layout-level mount fights
sticky positioning. Future tour-internal pages won't silently lose
the breadcrumb.

Made-with: Claude Code (budget redesign fix-up)
```

---

## V. Verify (~30 min)

Run all of these. Report pass/fail per item. If anything fails, fix on the same branch before declaring done.

### V.1 Budget critical (X1)

1. Open any tour's budget page. Click any line item row. Edit a field (e.g. change Estimated from $100 to $200). Confirm save persists across reload.
2. Click "Hotel Block" Quick Add. Slide-over opens with category = Accommodation, blank vendor field. Type a vendor name. Save. Confirm new row appears in the table with status Draft.
3. Same for Freight, Catering, Local Crew.
4. Drag a PDF into the Receipt Inbox. Confirm upload succeeds, no HTML error returned.
5. Visit `/tours/[id]/budget`. Confirm only one budget UI is visible — no legacy "Budget workspace" + Income/Expenses tabs at the bottom.

### V.2 Budget visual (X2)

6. Burn Rate chart shows multiple bars across the tour duration with phase boundaries marked.
7. Macro Allocation donut + legend size to content; no massive empty container.
8. Create two near-duplicate items (same vendor, similar amount, within a week). Duplicate banner appears. (If thresholds make this hard to trigger, document and confirm with Adam.)

### V.3 Tour Hub (X3)

9. Visit `/tours/[id]` (no sub-path). Page shows: breadcrumb top, Switch tour pill right, hero with status pill, **Setup chip strip with five chips**, two big orange-bordered CTA cards (Advance + Budget), TimelineDashboard, four secondary cards. **NO left-rail of tabs.**
10. Setup chip strip: pick a tour with riders but no channel list. Channel list chip shows `—` (gray), not `✓` (green).
11. Click Advance card → `/tours/[id]/advance` opens.
12. Click Budget card → `/tours/[id]/budget` opens.
13. Click Switch tour pill → dropdown lists this artist's other tours; clicking switches.

### V.4 Phase N hygiene (X4)

14. `CLAUDE.md` has the new bullet under Critical conventions.
15. `TourBreadcrumb` (or actual filename) has the top-of-file JSDoc.

### V.5 No regressions

16. Lint clean (75/120 baseline). Typecheck zero. Build via `next build --webpack` succeeds.
17. `/tours/[id]/advance` still works, `/tours/[id]/routing` still works, `/tours/[id]/channel-list` still works (these depend on the legacy left-rail being PARTIALLY removed in X3 — only from the hub, not from sub-pages).

---

## When done

```
Budget redesign + Tour Hub fix-up done.
Commits: <X1-sha>, <X2-sha>, <X3-sha>, <X4-sha>.
- X1: budget critical bugs (line edit, Quick Add, receipt upload, legacy tabs removed from page)
- X2: budget visual fixes (Burn Rate sizing, Macro Allocation layout, duplicate detection wiring)
- X3: Tour Hub redesign actually shipped (breadcrumb, Setup strip with channel_list_rows truth source, two big CTAs, secondary cards, legacy left-rail removed from hub)
- X4: CLAUDE.md + TourBreadcrumb JSDoc documenting per-page mount convention
- Lint + typecheck clean. Built via next build --webpack. PR #6 ready to merge.
```

If X3's audit reveals the Tour Hub components from PR #3 don't exist at all, that's a multi-hour build, not a mount-and-go. Surface in the report so Adam can decide whether to time-box X3 to "build minimally to spec" or full-scope it.
