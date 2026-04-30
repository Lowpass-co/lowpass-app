# Budget Redesign — Phase 0 Audit + Scope Plan

Companion to the budget redesign sprint (`docs/handover/CC_BUDGET_REDESIGN.md`). Captures the current-state findings and per-phase decisions before any UI code lands.

---

## §1. What's at `/tours/[id]/budget` today

`src/app/(app)/tours/[id]/budget/page.tsx` (63 lines) renders `<TourBudgetRebuildClient>` (the UX14 rewire) inside `topBarOnlyAppPageShell`. Single client component; no tab nav at the route level. The eight legacy "Tab" files (Salaries / Income / Commissions / Production / Summary / Settlement / Hotels / DayView, ~5,500 lines combined) live in `src/components/budget/` but are imported only by `BudgetTabs.tsx` and `BudgetFolderTabsNav.tsx` — those wrappers are **NOT mounted on `/tours/[id]/budget`**.

Where the legacy tabs ARE used: `BudgetTabs.tsx` is referenced from `_legacy/budget/BudgetDetailShell.tsx`, suggesting they were retired earlier and the modern entry is `TourBudgetRebuildClient`. The 5,500-line burden is dead weight — already orphaned, just not yet quarantined to `_legacy/`.

**Implication:** Phase C's "retire the eight legacy tabs" is mostly file-moves to `_legacy/budget/`. No active surface area to migrate; the UX14 rewire already replaced them.

---

## §2. What `TourBudgetRebuildClient.tsx` (UX14) delivers

388-line client component. Renders one `<BudgetSection>` per section kind (`income`, `salaries`, `commissions`, `production`, `settlement`, `hotels`, etc., from `BUDGET_SECTION_ORDER`) with a `<SpreadsheetGrid>` per section. Features:

- Inline edit via SpreadsheetGrid; debounced PATCH to `/api/budget/line-items`
- Per-section primary-currency detection + `convertToCurrency` for cross-currency display
- Section anchors via URL hash (e.g. `#income`)
- `BudgetLineSlideOver` for full-row editing
- Section totals computed via `computeSectionTotals`

**What it does NOT do:** no phase context, no macro allocation viz, no burn-rate timeline, no receipt inbox, no duplicate detection. UX14 is "spreadsheet edits per category"; the variant designs are "tour-phase-aware budget hub". They're complementary, not overlapping.

**Implication:** Phase C keeps `TourBudgetRebuildClient` reachable as a "details / inline edit" surface but routes the default `/tours/[id]/budget` to the new redesigned hub.

---

## §3. Schema reality

| Table | Migration | Used by |
|---|---|---|
| `budget_line_items` | 017 (+ 054 added `section`) | UX14 rewire, all section APIs |
| `budget_line_item_attachments` | 017 → 024 | `/api/budget/receipts` |
| `budget_line_item_notes` | 017 → 024 | `/api/budget/line-items/notes` |
| `budget_settings` | 017 | Tour-level budget config |
| `budget_commissions` | 017 | Commissions tab (orphaned) |
| `budget_income` | 017 | Income tab (orphaned) |
| `expenses` | 055 | Canonical expense entity |
| `deal_memos` | 053 | Canonical deal memo |
| `personnel_rates` | 017 / 025 | Salaries computation |

`BudgetLineItem` interface (from `src/types/index.ts`) includes: `currency`, `proposed_cost`, `actual_cost`, `quantity`, `category`, `section`, `status`, `tags[]`, `routing_id`, `flight_id`, `hotel_id`, `room_id`, `gear_id`, `tour_gear_id`, `linked_item_ids[]`, `notes`. Rich enough to power every variant feature without schema changes.

**No `native_currency` / `native_amount` columns** — the `currency` field is per-row. Phase F's "multi-currency display" reads as: each row stores `(amount, currency)`; display layer converts to tour currency for header totals, shows native amount as a footnote when row currency differs from tour currency.

---

## §4. Per-tab disposition

| Tab | Lines | Truly active? | Disposition |
|---|---|---|---|
| `SalariesTab` | 841 | No (orphaned via `BudgetTabs.tsx`) | **Retire** → `_legacy/budget/`. Salaries lift into the unified table as rows with `category = 'crew'` (already the case via `personnel_rates → budget_line_items`). |
| `IncomeTab` | 1100 | No | **Retire** → `_legacy/budget/`. Income lives in `budget_income`; surface as a separate panel inside the unified hub if needed (pending Phase C decision). |
| `CommissionsTab` | 699 | No | **Retire** → `_legacy/budget/`. `budget_commissions` is rarely-edited config; fold into a settings section under Phase F. |
| `ProductionTab` | 549 | No | **Retire** → `_legacy/budget/`. Production folds in as `category = 'production'` rows in the unified table. |
| `SummaryTab` | 651 | No | **Retire** → `_legacy/budget/`. The new MacroAllocationDonut + BurnRateChart from Phase B replace it. |
| `SettlementTab` | 341 | No | **Move** → `/tours/[id]/budget/settlement` (Adam-confirmed). Self-contained close-out flow; warrants its own route. |
| `HotelsTab` | 604 | No | **Retire** → `_legacy/budget/`. Hotels are now the canonical `rooms`/`hotels` entities (UX11) surfaced via `room_id` / `hotel_id` on budget rows + the dedicated `/tours/[id]/rooming` page. |
| `DayViewTab` | 370 | No | **Retire** → `_legacy/budget/`. The dedicated `/tours/[id]/day` page already covers this surface; budget-overlay-on-day-view is non-essential. |

**Net effect of Phase C:** all 5,543 lines move to `_legacy/budget/` (file relocation, no deletion). The active surface becomes the Phase A–F redesign + the existing `TourBudgetRebuildClient` for inline section edits.

---

## §5. OCR / receipts infrastructure

`grep -rEi "ocr|tesseract|extract.*receipt|receipt.*extract" src/` returns **no matches**. No backend extraction service, no scheduled worker, no `extracted_*` columns on `budget_line_item_attachments`.

`/api/budget/receipts` exists but is a CRUD shim over `budget_line_item_attachments`, not an extraction pipeline.

**Implication:** Phase D ships **manual upload + manual link only**. OCR is a follow-up infrastructure sprint requiring (a) a cloud OCR service, (b) storage-bucket triggers, (c) extraction worker queue, (d) confidence-scored matching heuristic. All four are out of scope for this sprint. Phase D feature-flags the OCR-aware UI behind `NEXT_PUBLIC_RECEIPT_OCR_ENABLED` (default `false`) so it can flip on cleanly when infrastructure lands.

---

## §6. Currency handling

`tour.currency` (`Tour.currency: string`) is the canonical currency for a tour.
`budget_line_items.currency` (`string | null`) is the per-row currency.
`src/lib/budget/fx.ts` exists and exposes `convertToCurrency(amount, from, to, rates)`. Static rate table — no live FX call.
`/api/budget/exchange-rate` exists as a stub but reads from a hardcoded table per the file's content (verified).

**Implication:** Phase F is straightforward — display layer converts `(actual_cost, row.currency)` to `tour.currency` using `convertToCurrency`; row footnote shows the native amount when `row.currency != tour.currency`. Currency switcher in the page header re-runs `convertToCurrency` against a different display target without mutating data. Live FX is out of scope.

---

## §7. Charts / chart library availability

`package.json` dependencies: `clsx`, `googleapis`, `jspdf`, `jszip`, `leaflet`, `next`, `react`, `xlsx`. **No Recharts. No Chart.js. No D3. No Victory. No Nivo. No visx.**

`grep -rn "import.*chart\|<BarChart\|<PieChart\|<LineChart"` returns no matches in `src/`. There are no existing chart components to model from.

**Direct contradiction in the spec:** §1 says "No new dependencies" AND "use Recharts if none of those are imported yet." Both can't be true. Resolution chosen here:

> **Hand-roll SVG charts.** Lowpass already uses small custom SVG (e.g. the `ProgressRing` in `AdvanceShowContextBar`, the `MapView` via Leaflet). Adding Recharts would pull in a 90KB+ dependency for two charts; hand-rolled SVG matches the existing house style, fits the brand-token system natively, and respects "no new dependencies."

Phase B's `MacroAllocationDonut` and `BurnRateChart` are SVG-only components, no library.

If Adam decides Recharts is worth the dep cost in a follow-up sprint, the components are easy to swap — they're presentational with `data` props.

---

## §8. Variant feature classification

| Feature | Status | Phase | Notes |
|---|---|---|---|
| Tour Phase Context strip | ✓ In scope | A | Centerpiece. Auto-computed phases, sticky strip. |
| Macro Allocation donut | ✓ In scope | B | Hand-rolled SVG. |
| Burn Rate / Financial Timeline | ✓ In scope | B | Hand-rolled SVG bar chart with phase boundary markers. |
| Receipt Inbox sidebar | ✓ In scope (manual only) | D | OCR features feature-flagged off; flip on when infra lands. |
| Quick Add templates (Hotel Block / Freight / Catering / Local Crew) | ✓ In scope | C | Pre-fill `BudgetLineSlideOver`. |
| Possible duplicate detection banner | ✓ In scope | E | SQL-only detection (vendor + amount + date proximity). |
| Variance impact callouts (>5% over) | ✓ In scope | E | Inline tinted variance cell + hover tooltip. |
| Bulk select + bulk edit | ✓ In scope | E | Sticky bottom action bar. |
| Multi-currency display | ✓ In scope | F | Per-row footnote when row currency ≠ tour currency. |
| PDF / XLSX export | ✓ In scope | F | jspdf + xlsx already installed. |
| Smart Alerts sidebar (variant feature) | ✗ Deferred | — | No rule engine; defer until alert sources concrete. |
| AI tip footers (variant feature) | ✗ Out of scope | — | No AI infrastructure. |
| Saved views | ✗ Deferred | — | DataTable's built-in column toggle covers most needs; named saved views is a follow-up. |
| Real-time impact footer (variant feature) | ✗ Deferred | — | Data-modeling complexity (live recompute on every change); follow-up. |
| Inline payment schedule (Deposit 50% / Final 50%) | ✗ Deferred | — | Requires payment_schedule schema; follow-up. |
| Drag-drop receipt zone | ✓ In scope | D | Manual file upload, drag-drop is presentational only. |
| Inline notes & activity (chat-like history) | ✓ Partial | C | `budget_line_item_notes` already exists; surface in `BudgetLineSlideOver`. Activity audit log is deferred. |

---

## §9. Decision log

1. **Phase N skipped.** Already shipped in PR #3 commit `aaaf097`. Re-doing on this branch creates merge conflicts.
2. **Settlement → `/tours/[id]/budget/settlement`.** Adam pre-confirmed.
3. **Charts hand-rolled SVG, no Recharts.** Spec contradiction resolved per §7.
4. **OCR feature-flagged off.** No backend; flip on when infrastructure ships.
5. **Live FX rates deferred.** Static table from `src/lib/budget/fx.ts` for v1.
6. **Legacy tabs file-moved, not deleted.** Per the existing `_legacy/budget/` quarantine convention. 5,500+ lines preserved for reference.
7. **TourBudgetRebuildClient retained.** The new hub is layered on top, not a full replacement. Inline section edits stay reachable via the existing component.

---

## §10. Sprint structure

| Phase | Commit | Scope |
|---|---|---|
| N | _(skipped)_ | Already in PR #3 |
| 0 | This commit | Audit doc |
| A | 1 commit | Tour Phase Context strip + page shell |
| B | 1 commit | Macro Allocation + Burn Rate panels |
| C | 1 commit | Main table redesign + retire legacy tabs |
| D | 1 commit | Receipt Inbox (manual only) |
| E | 1 commit | Duplicate detection + variance callouts + bulk edit |
| F | 1 commit | Multi-currency display + PDF/XLSX export |

Eight commits total (Phase 0 through F). Phase V is verification only — no commit unless something breaks.
