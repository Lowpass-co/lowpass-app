# Budget Redesign + Nav Fixup — Tour Phase Context + Macro Allocation + Receipt Inbox + Smart Detection

> Adam ran the budget area through Variant and got back four cohesive concept screens (TourSync × 2, TourFlow, TourSync OS) showing what a modern tour-budget UI looks like. The current Lowpass budget is described by Adam as a "broken legacy mess" — eight separate tabs (Salaries / Income / Commissions / Production / Summary / Settlement / Hotels / DayView) sitting alongside a UX14 SpreadsheetGrid rewire that didn't quite finish the job. This prompt rebuilds the budget area to match the variant aesthetic — single unified page, tour-phase context strip, macro allocation panel, burn-rate timeline, receipt inbox sidebar, smart duplicate detection — using existing Lowpass primitives and brand. **Tour Phase Context strip is the killer feature Adam specifically called out — make sure that one ships clean.**
>
> **This prompt also folds in the nav-redesign fix-up** that was queued separately (channel-list chip truth source + Setup-chip audit + TourBreadcrumb hygiene). Phase N at the top knocks that out as a quick-warmup commit before the budget work. Adam wants both shipped in a single PR.
>
> **Adam's two product locks for this run:**
>
> 1. **Each leg is its own tour.** No multi-leg detection inside a tour — phases are always a linear Pre-Prod → Rehearsals → Show Days → Wrap. Phase A's algorithm simplifies accordingly.
> 2. **Settlement gets its own route** at `/tours/[id]/budget/settlement` (one of the legacy-tab dispositions in Phase 0's audit, pre-confirmed).

---

## 0. Required reading

Before writing any code:

1. `CLAUDE.md`
2. `docs/handover/HANDOVER_FOR_BEN_2026_04_29.md` — current state of the codebase
3. `docs/cursor-prompts/CURSOR_PROMPT_UX14_BUDGET_REBUILD.md` — what the existing rewire was supposed to do
4. `src/app/(app)/tours/[id]/budget/page.tsx` — current entry point
5. `src/components/budget/TourBudgetRebuildClient.tsx` — what UX14 actually shipped
6. `src/components/budget/BudgetTable.tsx`, `BudgetSection.tsx`, `BudgetDetailShell.tsx`, `BudgetDetailPanelLayout.tsx` — the legacy table machinery
7. The eight tab components in `src/components/budget/`: SalariesTab, IncomeTab, CommissionsTab, ProductionTab, SummaryTab, SettlementTab, HotelsTab, DayViewTab — these are the "broken legacy mess" Adam wants gone
8. `src/components/spreadsheet-grid/SpreadsheetGrid.tsx` and `docs/components/SPREADSHEET_GRID_CONTRACT.md`
9. `src/components/data-table/DataTable.tsx` and `docs/components/DATA_TABLE_CONTRACT.md`
10. `src/components/shell/SlideOver.tsx` and `docs/components/SLIDE_OVER_CONTRACT.md`
11. `src/components/tours/TourBreadcrumb.tsx` (or wherever the breadcrumb from the nav redesign lives) — must mount on this page per the nav-redesign hygiene rule
12. `src/components/advance/AdvanceShowContextBar.tsx` — model for the sticky Tour Phase Context strip
13. `src/types/index.ts` — `DayType`, `Tour`, `Routing` types
14. `database/migrations/017_*.sql` and `database/migrations/053_deal_memos.sql`, `055_expenses_canonical.sql`, `054_budget_line_items_section.sql` — schema for budget_line_items, expenses, deal memos
15. **Variant reference screenshots** — Adam pasted four budget concepts (TourSync Budget Builder, TourSync Active Tour, TourFlow Logistics drill-down, Variant Burn Rate Mapping) plus four ops dashboards. Treat them as design reference, not literal mockup. Lowpass branding (brand orange `#FF4500`, dark theme, existing tokens) is non-negotiable — do not adopt the purple/blue palettes from the variants.

---

## 1. Hard rules

1. No new dependencies. Recharts, Chart.js, D3 are already available — use whichever the codebase already imports for chart needs. If none of those are imported yet, use Recharts (it's the canonical Lowpass chart library).
2. All visual values via `var(--lp-…)` tokens. Brand orange transparent variants must be hex+alpha (`#FF45001a`) or `color-mix(in srgb, var(--lp-orange) X%, transparent)` — never JS string concat.
3. No `any`, no `// @ts-ignore`.
4. Lint clean (75/121 baseline). Typecheck zero errors.
5. Build via `next build --webpack` only.
6. **Existing primitives or it doesn't ship.** `<DataTable>` for list views, `<SpreadsheetGrid>` for grid edit, `<SlideOver>` for context panels, `<EntityChip>` for entity references, `<PageShell>` for page chrome, `<TourBreadcrumb>` mounted at the top per nav-redesign convention. Inventing a fifth primitive is a flag, not a feature.
7. **Brand fidelity.** The variants use purple, blue, gradient accents. Lowpass uses brand orange `#FF4500` for primary actions and accents, `--color-lp-status-*` for status pills, `--color-lp-day-*` for day-type tags. Don't import variant colours.
8. **Phased delivery.** Phase N (nav fixup) lands first as a quick-warmup commit. Phase 0 audit + scope confirmation lands second as a docs-only commit. Phases A–F are one commit each. Phase V is verification only. **Nine commits total** if Phase 0 reveals no surprises; could be more if Phase 0 surfaces blockers.
9. Adam's product locks (do not relitigate):
   - **Each leg is its own tour.** Phase computation is linear (Pre-Prod → Rehearsals → Show Days → Wrap), no multi-leg detection inside a tour. See Phase A.
   - **Tour Phase Context strip is the centrepiece.** Phases auto-computed from routing day_types (see §2 of Phase A). User-defined phase overrides are out of scope for this sprint.
   - **Single unified page.** The eight legacy tabs (Salaries / Income / Commissions / Production / Summary / Settlement / Hotels / DayView) are retired. Their content either folds into the unified page or moves to dedicated routes. **Settlement → `/tours/[id]/budget/settlement`** (Adam-confirmed); everything else inline as filterable rows unless Phase 0 surfaces another tab worth its own route.
   - **Receipt Inbox is real but defer-able.** If the OCR backend doesn't exist (likely), Phase D ships as a manual upload + manual link UI — no OCR. Adding OCR is a separate infrastructure sprint.
   - **Multi-currency display only.** Show actuals in tour currency with a native-currency footnote where the underlying transaction was in a different currency. Don't build live FX conversion.
   - **No speculative features.** "Smart Alerts" sidebar from the variants is nice but skip it for v1 unless an existing rule engine surfaces. Same for the AI-tip footers.

---

## N. Phase N — Nav redesign fixup (~30 min)

Quick-warmup commit before the budget work. Three items, all small. Lands as a single commit.

### N.1 Channel list Setup chip — replace proxy with real check

`getTourHubData()` (or wherever Tour Hub setup status is resolved per the nav redesign Phase C) currently treats the Channel list Setup chip as TRUE when any `rider_packs` row exists for the tour. That's a proxy and it lies — riders and channel lists are different concepts. Replace with an existence check against `channel_list_rows`:

```ts
const { data: channelRow } = await supabase
  .from('channel_list_rows')
  .select('id')
  .eq('tour_id', tourId)
  .limit(1)
  .maybeSingle();
const channelListSetup = channelRow !== null;
```

`channel_list_rows.tour_id` is indexed (verify in `migrations/040_channel_list.sql`; if not, add an index in a separate one-line migration but not inside this commit). Drop any `// proxy` comment that was there.

### N.2 Audit other Setup chips for proxies

While in the same file, verify each Setup chip queries its actual truth source. Expected:

| Chip | Truth source | Cheap query |
|---|---|---|
| Routing | `routing` table | `SELECT id FROM routing WHERE tour_id = X LIMIT 1` |
| Channel list | `channel_list_rows` | (the fix in N.1) |
| Personnel | tour-personnel link table — likely `personnel_tour_assignments` or `tour_personnel`; check the schema | `SELECT id FROM <table> WHERE tour_id = X LIMIT 1` |
| Rooming | `rooming_grid` table | `SELECT id FROM rooming_grid WHERE tour_id = X LIMIT 1` |
| Riders linked | count of rider_pack→tour links via `rider_folders.tour_id` or whichever the rider system uses | `SELECT count(*) FROM <link table> WHERE tour_id = X` |

For each chip: read the existing implementation, confirm it's hitting the right table. If any other chip is also using a proxy, fix it the same way (real existence check). Add a brief inline comment naming the source table per chip.

If a chip's actual truth source is genuinely heavy to query (e.g. requires joining four tables), surface in the commit message rather than silently re-introducing proxies.

### N.3 Document the per-page TourBreadcrumb mount pattern

Phase D of the nav redesign mounted `<TourBreadcrumbServer>` per-page rather than in `tours/[id]/layout.tsx` because PageShell's scroll structure puts a layout-level mount outside the sticky scroll context. That decision is correct, but it means **every new page added under `src/app/(app)/tours/[id]/**`** must remember to mount `<TourBreadcrumbServer tourId={tourId} pageName="..." />` at the top. There's currently no enforcement.

Two things to add:

1. **`CLAUDE.md` note.** In the "Critical conventions" section, add a bullet:
   > **Tour-internal pages require `<TourBreadcrumbServer>`.** Every page under `src/app/(app)/tours/[id]/**` must mount `<TourBreadcrumbServer tourId={...} pageName="..." />` at the top of its content tree. The mount cannot live in `tours/[id]/layout.tsx` because PageShell's scroll structure puts the layout outside the sticky scroll context. See the nav redesign Phase D commit for the pattern.

2. **`<TourBreadcrumbServer>` JSDoc.** Add a top-of-file comment in `src/components/tours/TourBreadcrumbServer.tsx` (find the actual file via grep):
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
    * If you're adding a new tour-internal page and forgot to mount this,
    * the user loses the [Back to tour] escape hatch. Don't.
    */
   ```

### N.4 Acceptance

- [ ] Channel list chip queries `channel_list_rows` directly (or its actual table)
- [ ] Every other Setup chip queries its actual truth source
- [ ] Inline comment per chip names the source table
- [ ] `CLAUDE.md` has the new bullet under Critical conventions
- [ ] `<TourBreadcrumbServer>` has the top-of-file JSDoc
- [ ] Lint + typecheck clean

### N.5 Commit

```
fix(tour-hub): replace channel-list Setup chip proxy + truth-source audit + breadcrumb hygiene note

Channel list chip was treating any rider_packs row as a positive
signal. Riders and channel lists are different concepts. Replaced
with an existence check against channel_list_rows (cheap indexed
read).

Audited the other Setup chips while there: each now queries its
actual truth source with an inline comment naming the table.
[List any other chip changes here, or "no other proxies found".]

Added a CLAUDE.md note that <TourBreadcrumbServer> must be mounted
per-page on every tour-internal page (cannot live in layout because
PageShell's scroll structure breaks sticky positioning) plus a
JSDoc on the component file explaining why and what breaks if
forgotten — Phase D's per-page mount pattern is now documented as
a required convention.

Made-with: Claude Code (nav fixup + budget redesign sprint)
```

---

## 0. Phase 0 — Audit + scope confirmation (~1.5 hr)

Before writing any UI code, produce a scope confirmation report so Adam can review the plan against existing reality. Save as `docs/handover/BUDGET_REDESIGN_AUDIT.md`.

### 0.1 Audit current state

Sections of the audit:

1. **What's at `/tours/[id]/budget` today.** What does `page.tsx` render? Is it the eight tabs, the UX14 rewire, or both? Read the entry point and follow the imports.
2. **What does `TourBudgetRebuildClient.tsx` actually deliver?** Does UX14 ship the SpreadsheetGrid for the budget? What columns, what data shape, what features (sort/filter/inline edit, etc.)?
3. **Schema reality.** What are the canonical tables? `budget_line_items` (053?), `expenses` (055), `deal_memos` (053), `budget_settings`, `budget_commissions`, `budget_income`, `budget_line_item_attachments`, `budget_line_item_notes`. Do they all flow through the UX14 rewire or only some?
4. **Per-tab content.** What is each of the eight legacy tabs actually showing? Some of them might be doing useful work (SettlementTab probably surfaces close-out flow that's its own thing); others might be redundant with UX14. Map each tab → "fold into unified page", "move to its own route", or "retire entirely".
5. **OCR / receipts infrastructure.** Does any code reference OCR, receipt extraction, document parsing? Grep for `ocr|tesseract|extract|receipt`. If nothing turns up, Phase D ships as manual-upload-only.
6. **Currency handling.** How is `tour.currency` used today? Are budget rows multi-currency or always converted at entry? Find the decision point.
7. **Recharts / chart libs.** What's already imported for charts? `import { … } from 'recharts'` or anywhere similar.

### 0.2 Scope plan

For each variant feature, classify:
- **In scope, Phase X** — feature lands in this sprint, in the named phase
- **Deferred** — feature defers to a follow-up sprint with a named reason
- **Out of scope** — feature drops entirely with a reason

Variant features to classify:
- Tour Phase Context strip
- Macro Allocation donut
- Burn Rate / Financial Timeline chart
- Receipt Inbox sidebar with OCR
- Quick Add templates (Hotel Block / Freight / Catering / Local Crew)
- Possible duplicate detection banner
- Variance impact callouts (inline color-coded delta on rows)
- Smart Alerts sidebar (the "Logistics approaching limit" card)
- Bulk select + bulk edit
- Saved views
- Multi-currency switcher
- Export Report
- Inline notes & activity per row (chat-like history)
- Real-time impact footer
- Inline Payment Schedule expansion (Deposit 50% / Final 50% per item)
- Drag-drop receipt drop zone

### 0.3 Acceptance for Phase 0

- [ ] `docs/handover/BUDGET_REDESIGN_AUDIT.md` exists with all seven audit sections + scope plan
- [ ] Each legacy tab has a disposition (fold / move / retire)
- [ ] OCR availability is determined; Phase D scope adjusted accordingly
- [ ] Recharts (or equivalent) confirmed available; chart phase scoped accordingly
- [ ] Adam reviews and approves before Phase A starts

### 0.4 Commit

```
chore(budget): scope audit + redesign plan

Audits the current budget surface (entry route, UX14 rewire,
eight legacy tabs, schema, OCR/chart-lib availability) against
the variant-inspired redesign vision. Per-tab disposition listed
(fold / move / retire). Variant features classified in-scope /
deferred / out-of-scope per phase.

No UI changes in this commit — pure documentation. Phase A onwards
ships the actual code.

Made-with: Claude Code (budget redesign)
```

---

## A. Tour Phase Context strip + page shell (~2 hr)

Phase A is the centrepiece Adam called out. Get this one right and the rest follows.

### A.1 New component: `<TourPhaseContextStrip>`

`src/components/tours/TourPhaseContextStrip.tsx` — Server Component (or async wrapper around a Client Component if interactivity is needed).

Shape, top to bottom:

```
[ PRE-PROD ] [ REHEARSALS ] [ SHOW DAYS · LEG 1 ] [ TRAVEL ] [ WRAP ]
   Jan 1-Feb 15   Feb 16-Mar 10   Mar 11-May 22 (Current)   May 23-Jun 5   Jun 6-Jun 15
```

Visual treatment:
- Each phase is a clickable segment in a horizontal row (`grid-template-columns: repeat(N, 1fr)` where N is the phase count).
- Background: `var(--lp-surface)` with thin `var(--lp-border)` border, `var(--lp-radius-md)`.
- Active phase: `2px solid var(--lp-orange)` border + `color-mix(in srgb, var(--lp-orange) 8%, transparent)` background tint.
- Past phases: muted text, `var(--lp-text-tertiary)`.
- Future phases: full text, `var(--lp-text-secondary)`.
- Each segment shows: phase name (uppercase, weight 500, `var(--lp-text-sm)`) + date range below (lowercase, `var(--lp-text-xs)`, tertiary).
- Click a phase → filter the main table to that phase (lifted state).

### A.2 Phase computation rule

Phases auto-compute from `routing.day_type` values. **Each leg is its own tour, so phases are always linear (Pre-Prod → Rehearsals → Show Days → Wrap) — no multi-leg detection.** The function lives in `src/server/budget/computeTourPhases.ts`:

```ts
export interface TourPhase {
  key: 'pre-prod' | 'rehearsals' | 'show-days' | 'wrap';
  label: string;          // "Pre-Prod", "Rehearsals", "Show Days", "Wrap"
  startDate: string;      // ISO
  endDate: string;        // ISO
  isCurrent: boolean;
  isPast: boolean;
}

export async function computeTourPhases(tourId: string): Promise<TourPhase[]>;
```

Algorithm:
1. Fetch all `routing` rows for the tour ordered by date asc.
2. **Pre-Prod** — synthetic phase from `tour.start_date` (or 30 days before the first rehearsal/show, whichever is later — confirm sensible default in audit) up to the day before the first `rehearsal` or `show`/`festival` day.
3. **Rehearsals** — span from the first `rehearsal` day_type through the last `rehearsal` before any `show`/`festival`. If the tour has no rehearsal days, this phase is omitted.
4. **Show Days** — span from the first `show`/`festival` day through the last `show`/`festival` day, inclusive of any `travel` / `off` / `press` / `radio` / `tv` days mixed within (Adam's "show period" — once you're on tour, the in-between days are part of show days).
5. **Wrap** — synthetic phase from the day after the last show/festival through `tour.end_date` (or +14 days if `tour.end_date` is the same as the last show date — confirm sensible default in audit).

Mark `isCurrent` based on today's date being within `[startDate, endDate]`. Mark `isPast` if `endDate < today`.

Edge cases:
- **No rehearsals.** Phases are Pre-Prod → Show Days → Wrap (three segments).
- **Same-day-as-tour-start show.** Pre-Prod is a zero-day phase; render it muted with "—" date label. Don't break the layout.
- **Tour with no shows yet (still planning).** Show Days phase pulls from `tour.start_date` to `tour.end_date` as a placeholder; mark explicitly as "no shows scheduled" in the strip.

### A.3 Mount on the budget page

`src/app/(app)/tours/[id]/budget/page.tsx`:

- Wraps in `<PageShell archetype="document">` (or `dashboard` if the audit determines a different archetype suits — confirm in Phase 0).
- Mounts `<TourBreadcrumbServer tourId={...} pageName="Budget" />` at the top per the nav-redesign convention.
- Mounts `<TourPhaseContextStrip phases={phases} activePhaseKey={selectedPhaseKey} onPhaseChange={...} />` immediately below the breadcrumb. Sticky `position: sticky; top: var(--lp-space-12)` (i.e. just below the breadcrumb).
- Below that, a placeholder `<TourBudgetRebuildClient />` (existing) for now — Phases B–E will fill in the rest of the page around it.

### A.4 Acceptance

- [ ] `<TourPhaseContextStrip>` renders for any tour with at least one routing row
- [ ] Phases auto-compute correctly for a tour with rehearsals + shows (Pre-Prod → Rehearsals → Show Days → Wrap)
- [ ] Phases auto-compute correctly for a tour without rehearsals (Pre-Prod → Show Days → Wrap)
- [ ] Phases auto-compute correctly for an unscheduled / planning-only tour (placeholder Show Days span)
- [ ] Active phase is highlighted with brand-orange border + tint
- [ ] Click on a phase updates active-phase state (visual selection; main table filter wiring lands in Phase C)
- [ ] Strip is sticky below the TourBreadcrumb
- [ ] No lint/type regressions

### A.5 Commit

```
feat(budget): Tour Phase Context strip + page shell scaffold

Centrepiece of the budget redesign: a horizontal phase strip showing
Pre-Prod → Rehearsals → Show Days → Wrap with auto-computed date
ranges per tour. Current phase highlighted via 2px brand-orange
border + tinted bg.

Phases are linear (each leg = its own tour per Adam's product call;
no multi-leg detection). Derived from routing.day_type sequences via
new computeTourPhases() server helper. Synthetic Pre-Prod / Wrap
phases extend before/after the routing range. Rehearsals phase
omitted entirely if no rehearsal day_types exist.

Strip mounts directly below TourBreadcrumb on /tours/[id]/budget,
sticky just below it. Click-to-filter wiring lands in Phase C
once the main table redesign is in.

Made-with: Claude Code (budget redesign)
```

---

## B. Macro Allocation + Burn Rate panels (~3 hr)

Two side-by-side panels above the main table.

### B.1 Macro Allocation donut

`src/components/budget/MacroAllocationDonut.tsx` — Client Component (Recharts).

- Fetches budget_line_items grouped by category, sums totals.
- Renders a donut chart (Recharts `<PieChart>` with `innerRadius`).
- Center label: total spent (`$1.24M`-style abbreviation for >999k, else full).
- Sub-label: "TOTAL SPENT".
- Legend below: category swatch + name + percentage. Categories: Production, Logistics, Travel, Crew, Accommodation, Catering, Marketing, Insurance, Contingency.
- Colours: use the existing `--color-lp-day-*` palette as inspiration but introduce `--color-lp-cat-*` tokens if they don't exist. Confirm token availability in Phase 0 audit; add to `globals.css` if needed.

### B.2 Burn Rate / Financial Timeline chart

`src/components/budget/BurnRateChart.tsx` — Client Component (Recharts).

- Fetches budget_line_items joined to their date / phase membership, sums per-day spend.
- Renders a bar chart with bars per day or week (auto-bucket based on tour length).
- X-axis: phase boundaries (vertical dividers labelled with phase names from `<TourPhaseContextStrip>`).
- Y-axis: daily spend.
- Active phase: bars within the active phase use brand orange; other phases use `var(--lp-text-tertiary)`.
- Tooltip on hover: peak day callout ("$42,500 peak spend (Day 12)"-style — match the variant TourSync screenshot 1).

### B.3 Layout

The two panels sit in a row above the main table:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--lp-space-4)' }}>
  <MacroAllocationDonut tourId={tourId} />
  <BurnRateChart tourId={tourId} phases={phases} />
</div>
```

On narrower viewports (<1024px), stack vertically.

### B.4 Acceptance

- [ ] Donut renders with category breakdown matching the live budget data
- [ ] Burn Rate bars render with phase boundaries marked
- [ ] Active phase tint matches `<TourPhaseContextStrip>`'s active phase
- [ ] Hover tooltips work on both charts
- [ ] Charts re-render correctly when budget data changes (mutate hook or revalidate)
- [ ] Stacks on narrow viewports
- [ ] No lint/type regressions

### B.5 Commit

```
feat(budget): MacroAllocationDonut + BurnRateChart panels

Two-up panel above the main budget table. Donut shows category
allocation with brand-tokenised colours and a center total. Burn
Rate bar chart maps daily spend across the tour with phase
boundaries marked; active phase bars are brand orange.

Both render via Recharts. Data fetched server-side and passed in
as props to keep the budget page server-component-shaped where
possible.

Made-with: Claude Code (budget redesign)
```

---

## C. Main table redesign (~3 hr)

Replace the legacy budget table machinery with a single primitives-driven view. Per Phase 0 audit, decide between `<SpreadsheetGrid>` (if inline edit is the dominant use case) and `<DataTable>` (if it's read-with-occasional-actions). Default recommendation: `<DataTable>` with row-click → edit slide-over, since the variants show this shape.

### C.1 Columns

Columns left to right:
1. **Checkbox** — bulk select
2. **Item / Description** — item name (weight 500) + sub-line with phase tag pill + category
3. **Vendor** — vendor name with `<EntityChip kind="vendor" id={...} />` if vendor canonicals exist (probably don't yet — render plain text)
4. **Estimated** — currency value
5. **Actual** — currency value
6. **Final** — currency value (only renders for closed-out items)
7. **Variance** — percentage with up/down arrow + colour: green if under, red if over, gray if 0%
8. **Receipts** — icon with count badge; click opens Receipt slide-over (Phase D)
9. **Status** — pill using `--color-lp-status-*` tokens: Draft / Pending / Approved / Paid / Rejected
10. **Owner** — user avatar (the `AccountAvatar` from the nav-sprint pattern)
11. **Actions** — `⋯` menu: Edit · Duplicate · Delete · Mark as paid · etc.

### C.2 Row click → BudgetLineSlideOver

Existing `BudgetLineSlideOver.tsx` is the right primitive — convert it to use the `<SlideOver>` primitive (UX03) if it's not already, and ensure the edit form supports all columns.

### C.3 Phase filtering

Click on a `<TourPhaseContextStrip>` segment filters the table to rows in that phase (membership computed via the line item's date relative to phase boundaries from Phase A).

### C.4 Status filter chips above the table

Mirror the advance overview's pattern (UX22 Phase 1):
- Chips: All / Draft / Pending / Approved / Paid / Rejected
- Token-driven backgrounds via `--color-lp-status-*`
- Active chip highlighted with the matching status colour

### C.5 Search input + column toggle + sort

- Search filters by item name / vendor / category
- Column toggle hides/shows columns (DataTable's built-in)
- Sort by any column (DataTable's built-in)

### C.6 Quick Add templates strip at the bottom

Below the table, a horizontal strip of one-click templates that pre-fill a budget line:
- 🏨 Hotel Block (category: Accommodation, suggested vendor)
- 🚛 Freight (category: Logistics)
- 🍽 Catering (category: Catering)
- 👷 Local Crew (category: Crew)

Click → opens BudgetLineSlideOver with the template's fields pre-populated.

(Use the existing `<SlideOver>` primitive; do not roll a new modal.)

### C.7 Retire the eight legacy tabs

Per Phase 0 audit's per-tab disposition:
- Anything that folds in: lift its data into the unified table as additional rows (filterable by category)
- Anything that needs its own route (e.g. SettlementTab's close-out flow): create `/tours/[id]/budget/settlement` etc., add to the LeftRail's docSections variant for navigability
- Retire the rest: delete the tab file, remove from the BudgetFolderTabsNav

Keep the legacy code in `src/components/_legacy/budget/` (move, don't delete) per the existing legacy-quarantine convention.

### C.8 Acceptance

- [ ] Main table renders all budget_line_items via `<DataTable>` (or `<SpreadsheetGrid>` if Phase 0 chose that)
- [ ] Row click opens `BudgetLineSlideOver` (now using `<SlideOver>` primitive)
- [ ] Phase filter from `<TourPhaseContextStrip>` works
- [ ] Status filter chips work and stay consistent with row pills
- [ ] Search, sort, column toggle work
- [ ] Quick Add templates pre-populate the slide-over correctly
- [ ] Eight legacy tabs are gone (moved to `_legacy/budget/` or deleted), nav reflects the new structure
- [ ] No lint/type regressions

### C.9 Commit

```
feat(budget): main table redesign on DataTable primitive + retire legacy tabs

Budget table moved onto the DataTable primitive (UX05). Columns:
Item · Vendor · Estimated · Actual · Final · Variance · Receipts ·
Status · Owner · Actions. Status pills tokenised via
--color-lp-status-*. Variance with up/down arrows and color coding.

Row click opens BudgetLineSlideOver (now wrapped on the SlideOver
primitive). Phase strip click filters the table; status filter chips
mirror the advance overview pattern from UX22.

Quick Add templates strip below the table for one-click line-item
creation (Hotel Block, Freight, Catering, Local Crew).

Eight legacy tabs (Salaries, Income, Commissions, Production, Summary,
Settlement, Hotels, DayView) retired per Phase 0 audit's
per-tab disposition: useful flows fold into the unified table or
get their own routes; redundancies removed. Legacy components
moved to src/components/_legacy/budget/.

Made-with: Claude Code (budget redesign)
```

---

## D. Receipt Inbox sidebar (~2 hr; less if no OCR)

Right-side sidebar (or SlideOver on narrower viewports) for receipt management. Per Phase 0 audit's OCR finding:

### D.1a If OCR exists

`src/components/budget/ReceiptInbox.tsx` — fixed right sidebar on viewports >1280px, SlideOver otherwise.

Top section: drag-drop drop zone ("Drop receipts here or click to upload") that uploads to a known storage bucket and triggers OCR processing.

List of receipts with status:
- **Processing** — spinner, OCR in progress
- **Extracted** — vendor + amount + date + confidence% shown, "Auto-link" CTA (matches against existing budget_line_items by vendor + amount)
- **Linked** — green checkmark, shows linked item, "Unlink" option
- **Unlinked** — extracted but no auto-match, "Link manually" CTA

Click "Auto-link" → links to highest-confidence match. Click "Link manually" → opens a picker slide-over showing all unmatched budget_line_items.

### D.1b If OCR does not exist

Drop the OCR pieces. Receipt Inbox becomes a manual upload + manual link UI:

- Drag-drop drop zone uploads file, shows filename
- "Link to item…" button per uploaded file → picker slide-over
- No auto-extract, no confidence scores

Flag in the audit + commit message that OCR is a follow-up sprint requiring infrastructure work (cloud OCR service, storage bucket triggers, extraction worker queue).

### D.2 File storage

Receipts attach to budget_line_items via `budget_line_item_attachments` (existing table). Reuse, don't reinvent.

### D.3 Acceptance

- [ ] Receipt Inbox renders on the budget page (sidebar on wide viewports, SlideOver otherwise)
- [ ] Drag-drop upload works
- [ ] Receipts associate with budget_line_items via budget_line_item_attachments
- [ ] If OCR available: auto-extract + auto-link work; confidence scores visible
- [ ] If OCR not available: manual upload + manual link work; OCR-related UI hidden behind a feature flag
- [ ] Linked receipts show a count badge in the main table's Receipts column
- [ ] No lint/type regressions

### D.4 Commit

```
feat(budget): Receipt Inbox sidebar

Right-side Receipt Inbox surfaces all incoming receipts for the tour.
Drag-drop upload at the top. Receipts attach to budget_line_items
via budget_line_item_attachments (existing schema, no migration).

[If OCR available:] OCR auto-extracts vendor / amount / date with a
confidence score; "Auto-link" button matches against existing items
by vendor+amount; manual link picker for ambiguous cases.

[If OCR not available:] Manual upload + manual link only; OCR auto-
features are flagged behind a NEXT_PUBLIC_RECEIPT_OCR_ENABLED env
flag (default false) and ship as follow-up infrastructure work.

Made-with: Claude Code (budget redesign)
```

---

## E. Smart features — duplicate detection + variance callouts + bulk edit (~2 hr)

### E.1 Possible duplicate banner

When a new budget_line_item or receipt looks like a duplicate of an existing one (same vendor + amount within 5%, within 7 days), surface an inline banner above the duplicate's row:

```
⚠ POSSIBLE DUPLICATE: Similar receipt detected for Item #1204 (Backline Rental)  [View Comparison]
```

"View Comparison" opens a SlideOver showing both items side by side with "Merge" / "Keep both" / "Dismiss" actions.

Detection lives in `src/server/budget/detectDuplicates.ts` — pure SQL query, no heuristics service needed for v1.

### E.2 Variance impact callouts

When a row's variance exceeds 5% over budget, the variance cell renders with `--color-lp-status-needs-review` background tint and an inline tooltip on hover showing the impact ("+$2,700 / +6.3% over estimate · pushes Logistics category to 92% of allocation").

For >10% over, escalate to `--color-lp-status-rejected` red.

### E.3 Bulk select + bulk edit

The checkbox column in the main table enables multi-select. With ≥1 row selected, a sticky bottom bar appears:

```
[X selected] [Mark as: Approved ▾] [Set owner: ▾] [Delete] [Cancel]
```

Mark-as actions PATCH all selected rows. Delete prompts for confirmation.

### E.4 Acceptance

- [ ] Duplicate detection banner appears above duplicate rows; comparison slide-over works; merge/dismiss actions work
- [ ] Variance impact tooltips render on >5% over rows; visual escalation at >10%
- [ ] Bulk select shows the sticky action bar; mark-as and delete actions work end-to-end
- [ ] No lint/type regressions

### E.5 Commit

```
feat(budget): duplicate detection + variance callouts + bulk edit

Three smart features that match the variant designs:
- Possible-duplicate banner: SQL detection on vendor+amount+date
  proximity; inline banner above the suspect row; comparison slide-
  over with merge/dismiss actions.
- Variance impact callouts: rows >5% over render with a tinted
  variance cell and a hover tooltip showing the dollar/percentage
  impact and the category-level effect; escalates to red at >10%.
- Bulk select with sticky action bar (Mark as / Set owner / Delete)
  for multi-row operations.

Made-with: Claude Code (budget redesign)
```

---

## F. Currency display + export (~1 hr)

### F.1 Multi-currency display

Tour has a `currency` field. Budget_line_items may have a `native_currency` and `native_amount` (confirm in Phase 0 audit). When native_currency != tour.currency, render the row's currency cell as:

```
$45,200.00
38,200 GBP
```

Tour currency on top (weight 500), native amount below in `var(--lp-text-xs)` `var(--lp-text-tertiary)`.

If `native_currency == tour.currency` or `native_currency` is null, show only the tour-currency value.

Currency switcher in the page header (USD / GBP / EUR) — switches the DISPLAY currency only, not the underlying data. Conversion uses a static FX table in `src/lib/fx-rates.ts` (placeholder values acceptable for v1; live FX is its own infrastructure sprint).

### F.2 Export Report

Bottom-right "Export Report" button. Two outputs:

- **PDF** — formatted budget summary with the macro allocation donut + burn rate chart + grouped table by category + page footer
- **XLSX** — flat dump of all budget_line_items with all columns

Use the existing PDF generation pattern (search the codebase for prior PDF exports — likely uses `react-pdf` or a server-side renderer). XLSX uses `sheetjs` (CDN'd in artifact env, but for a real route confirm what's installed).

### F.3 Acceptance

- [ ] Rows with native_currency show both display and native amounts
- [ ] Currency switcher changes display currency without mutating data
- [ ] Export Report → PDF produces a formatted document
- [ ] Export Report → XLSX produces a flat spreadsheet
- [ ] No lint/type regressions

### F.4 Commit

```
feat(budget): multi-currency display + Export Report (PDF/XLSX)

Display rows in tour.currency with native-currency footnote when the
underlying transaction was in a different currency. Currency switcher
in the page header changes display only, not stored data. FX uses a
static table for v1; live rates are follow-up infrastructure.

Export Report renders to PDF (formatted summary with charts) or
XLSX (flat data dump). Uses existing export patterns.

Made-with: Claude Code (budget redesign)
```

---

## V. Verify (~30 min)

Smoke flows after all phases land:

0. **Phase N (nav fixup)**: Tour Hub Setup chips reflect actual data sources (a tour with riders but no channel list shows Channel list = —, not ✓). `CLAUDE.md` has the breadcrumb hygiene bullet. `<TourBreadcrumbServer>` has the top-of-file JSDoc.

1. **Phase strip**: open a tour with rehearsals + shows, confirm phases compute correctly (Pre-Prod → Rehearsals → Show Days → Wrap). Open a tour without rehearsals, confirm three-phase render (Pre-Prod → Show Days → Wrap). Click each phase, confirm the table filters.
2. **Macro allocation**: confirm donut sums match the table's category totals.
3. **Burn rate**: confirm the chart's bar sums match daily totals; phase boundaries align with the strip.
4. **Main table**:
   - Create a new line item via Quick Add (Hotel Block).
   - Edit it via row click; confirm slide-over saves.
   - Filter by status chip; confirm only matching rows show.
   - Search; confirm haystack matches.
5. **Receipts**:
   - Drag-drop a file; confirm upload works.
   - If OCR: confirm extraction completes and auto-link suggests a match.
   - If not: confirm manual link picker works.
6. **Smart features**:
   - Create two near-duplicate items; confirm the duplicate banner appears.
   - Edit a row to push variance >5%; confirm the impact tooltip appears.
   - Multi-select; confirm bulk-edit bar appears and bulk actions work.
7. **Currency**: switch the display currency; confirm rows reformat without losing data.
8. **Export**: trigger PDF and XLSX exports; confirm both download successfully.
9. **Print**: `Cmd+P` from the page; confirm sticky chrome (breadcrumb, phase strip) is hidden in print stylesheet, table prints cleanly.
10. **No regressions on adjacent pages**: open `/tours/[id]/advance` and `/tours/[id]/routing`; confirm they still render correctly.
11. **Lint clean (75/121 baseline). Typecheck zero. `next build --webpack` succeeds.**

If any step fails, fix before declaring done.

---

## When done

```
Nav fixup + budget redesign done.
Commits: <N-sha>, <Phase0-sha>, <A-sha>, <B-sha>, <C-sha>, <D-sha>,
         <E-sha>, <F-sha>.
- Phase N: nav redesign fixup — channel-list Setup chip queries
  channel_list_rows directly; other Setup chips audited for proxies;
  CLAUDE.md + TourBreadcrumbServer JSDoc document the per-page mount
  requirement.
- Phase 0: scope audit at docs/handover/BUDGET_REDESIGN_AUDIT.md.
- Phase A: Tour Phase Context strip (Pre-Prod → Rehearsals → Show Days
  → Wrap, linear since each leg is its own tour), auto-computed from
  routing.day_type, sticky on the budget page.
- Phase B: MacroAllocationDonut + BurnRateChart panels above the main
  table.
- Phase C: main table on DataTable primitive with phase filter, status
  chips, search, Quick Add templates. Eight legacy tabs retired to
  src/components/_legacy/budget/. SettlementTab moved to
  /tours/[id]/budget/settlement.
- Phase D: Receipt Inbox sidebar; OCR enabled if backend available,
  manual fallback otherwise.
- Phase E: duplicate detection + variance callouts + bulk edit.
- Phase F: multi-currency display + PDF/XLSX export.
- Lint + typecheck clean. Built via next build --webpack.
```

If any phase needs to defer (most likely Phase D if OCR isn't ready, or Phase E.1 if duplicate detection's SQL gets gnarly), surface in the report.

**Three things to flag for Adam if they come up during execution:**

1. **Legacy tab disposition** — Phase 0's per-tab plan needs Adam-review before retirement. Settlement is pre-confirmed for `/tours/[id]/budget/settlement`. If any other tab carries unique flow that wasn't obvious from filenames, confirm with Adam before deleting.
2. **OCR / FX rates** — both default to "manual / placeholder" for v1 with explicit env-flag wiring so they can flip on cleanly when infrastructure lands. Don't try to half-build either inside this sprint.
3. **Phase A edge cases** — the §A.2 rule covers rehearsals-present, rehearsals-absent, and unscheduled tours. If a tour produces weird phase boundaries that none of those edge cases handle (e.g. multiple rehearsal blocks separated by shows, which shouldn't happen but might in real data), surface rather than guess.
