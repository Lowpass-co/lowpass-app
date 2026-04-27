# UX14 — Budget Rebuild

> **Highest-impact prompt in the entire overhaul.** Replaces the current "ugly basic-HTML" Budget page with a `<SpreadsheetGrid>`-powered surface that consumes derived rows from canonical Flight / Person / Room / Gear entities. Aesthetic baseline: Bug Reports.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — sections 2 (principles), 4 (relational data model — derived rows rule), 7 (Phase D rollout).
2. `docs/components/SPREADSHEET_GRID_CONTRACT.md` (UX06).
3. `docs/components/SLIDE_OVER_CONTRACT.md` (UX03).
4. `src/app/(app)/bugs/page.tsx` — visual aesthetic baseline.
5. The user's existing budget spreadsheet (if present in `docs/` or as an attachment) — replicate the working structure, not the visual styling.
6. UX02–UX13 (must be merged).

---

## 1. Why this prompt exists

The current Budget page has been called out as the worst surface in the app: ugly, basic-HTML, slow menus, inconsistent number formatting, and worst of all — it's disconnected from canonical entities (flights / hotels / personnel rates / gear hire). The user spends real time entering the same data twice.

UX14 fixes all of that:
- Render via `<SpreadsheetGrid>` with Bug Reports aesthetic
- Sections per archetype (Income / Expenses / Hotels / Travel / Hire / Payroll / Per Diems / Other)
- Derived rows for canonical entities (read-only, marked with link icon)
- Manual rows for ad-hoc items
- Inline editing with keyboard nav
- Section totals + grand totals (computed, pinned)
- Slide-over for line-item context (notes, files, receipts, comments, math, activity)

---

## 2. Hard rules

1. **All editing happens inline in the grid.** SlideOver is for context only (per the slide-over contract).
2. **Derived rows are read-only.** Their values come from the canonical entity. Marker: link icon + tooltip "Linked to <entity name>".
3. **Section totals computed in JavaScript** from the visible rows; pinned at section bottom.
4. **Grand total** at the page bottom, pinned, with breakdown by section.
5. **Multi-currency support**: rows have a currency column. Section totals show in the section's "primary" currency (configurable). Grand total shows tour-default currency with FX line items below for non-default rows.
6. **Optimistic updates**: edits commit to UI immediately, persist via API. Server errors revert + toast.
7. **No new dependencies.**
8. **The current Budget code is replaced wholesale**, not patched. Move existing implementation to `_legacy/budget/` so diff is visible. Delete in a follow-up after sign-off.
9. Lint + typecheck clean.

---

## 3. Page layout

`/tours/[id]/budget` rendered with PageShell + `archetype: 'spreadsheet'`.

LeftRail variant: `spreadsheet` with sections:
- Income
- Expenses (top-level)
- Hotels (sub-section, inside Expenses)
- Travel (sub-section)
- Hire (sub-section)
- Payroll (sub-section)
- Per Diems (sub-section)
- Other (sub-section)
- Summary (read-only, last)

URL pattern: `/tours/[id]/budget#hotels` etc. for direct deep-linking.

Main content: one `<SpreadsheetGrid>` per section. Sections separated by an `H2` heading + summary chip showing section total.

---

## 4. Schema audit

Inspect the current budget schema. Likely tables:
- `budget_lines` (or similar) — already extended in UX09/UX11/UX12 with `flight_id`, `hotel_id`, `room_id`, `gear_id`, `tour_gear_id` FKs

If there's no canonical "section" / "category" column on budget_lines, add one:

```sql
-- (only run if needed)
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS section text, -- 'income' | 'expenses' | 'hotels' | 'travel' | 'hire' | 'payroll' | 'per_diems' | 'other'
  ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0;

CREATE INDEX IF NOT EXISTS budget_lines_section_idx ON public.budget_lines(section);
```

This goes in a small migration `NNN_budget_section_normalisation.sql`. Run as part of UX14.

---

## 5. Step 1 — Column definitions per section

Each section has its own column set. Define in `src/components/budget/sections/<section>.columns.ts`:

### 5.1 Income
- Description (text)
- Amount (currency)
- Currency (select)
- Show / Tour-wide (entityRef show, optional)
- Status (select: confirmed / projected / received)
- Notes button (opens slide-over)

### 5.2 Hotels
- Hotel (entityRef hotel, may auto-derive description)
- Room (entityRef room, may auto-derive cost)
- Nights (number)
- Cost per night (currency, derived from room when linked)
- Total (currency, computed = nights × cost-per-night)
- Currency (select, derived from room when linked)
- Show (entityRef show)
- Notes button

### 5.3 Travel
- Flight (entityRef flight)
- Description (text — derived when linked: "BA1234 LHR→JFK")
- Amount (currency, derived from flight when linked)
- Currency (select, derived)
- Show (entityRef show)
- Notes button

### 5.4 Hire
- Gear (entityRef gear, filtered to ownership=hired_to_client)
- Description (text — derived)
- Quantity (number, derived from tour_gear)
- Unit cost (currency, derived)
- Period (select: day / week / flat)
- Total (computed)
- Currency (select)
- Notes button

### 5.5 Payroll
- Person (entityRef person)
- Role (text — derived from tour_personnel)
- Rate (currency, derived)
- Period (select)
- Days/Weeks (number)
- Total (computed)
- Currency (select)
- Notes button

### 5.6 Per Diems
- Person (entityRef person, optional — null = whole crew)
- Date range (date range)
- Daily rate (currency)
- Days (number)
- Total (computed)
- Currency
- Notes button

### 5.7 Other / Expenses (catch-all)
- Description (text)
- Amount (currency)
- Currency
- Date
- Show (entityRef show)
- Receipt count (computed; if any receipts linked, render as small badge — clicking opens slide-over)
- Notes button

### 5.8 Summary (read-only)
- Section name
- Section total (in tour default currency)
- Section total (in section primary currency, if different)
- # rows
- # derived rows
- Notes (free text)

---

## 6. Step 2 — Section component

Build `src/components/budget/BudgetSection.tsx`:

```tsx
type BudgetSectionProps = {
  section: BudgetSectionKind;
  tourId: string;
  rows: BudgetLine[];
  onCommitCell: (rowId: string, columnId: string, value: unknown) => Promise<void>;
  onAddRow: () => Promise<void>;
  onDeleteRows: (ids: string[]) => Promise<void>;
  onOpenContext: (row: BudgetLine) => void;
  // Currency settings
  primaryCurrency: string;
  tourDefaultCurrency: string;
};
```

Renders:
- Section heading + total chip
- `<SpreadsheetGrid>` with the section's columns
- "+ Add row" button at bottom
- Computed total row pinned

---

## 7. Step 3 — Page composition

`src/app/(app)/tours/[id]/budget/page.tsx`:

```tsx
const tour = await getTour(id);
const lines = await listBudgetLines(id);
const grouped = groupBySection(lines);

return (
  <PageShell
    topBar={<TopBar … />}
    leftRail={<LeftRail variant={{ kind: 'spreadsheet', sections: BUDGET_SECTIONS, activeId }} />}
    archetype="spreadsheet"
  >
    <BudgetClient initialLines={lines} tourId={id} primaryCurrency={tour.currency} />
  </PageShell>
);
```

`BudgetClient` is the client component that:
- Maintains the lines state with optimistic updates
- Renders one `<BudgetSection>` per section, in order
- Computes section totals + grand total
- Wires `onOpenContext` to a `<BudgetLineSlideOver>` mounted at the page level (only one open at a time)

---

## 8. Step 4 — `<BudgetLineSlideOver>`

File: `src/components/budget/BudgetLineSlideOver.tsx`

Sections (per the slide-over contract — context only):
1. **Notes** — rich text
2. **Receipts** — list of linked Expense / Receipt entities (will become real in UX19); for now, links to the existing receipts table or a placeholder
3. **Attachments** — files
4. **Comments** — threaded discussion
5. **Math scratchpad** — running calculator (simple component: enter expressions, see running result, attach result to row's amount with a "Set as amount" button — this is the only edit affordance in the slide-over, and it's explicit)
6. **Activity** — audit log

If the row is derived (linked to canonical entity), section 0 is added: **Source** — EntityChip pointing to the canonical entity, with "Edit at source" button.

---

## 9. Step 5 — Currency + FX

Tour has a `default_currency`. Each budget line has its own `currency`. Section totals show:
- Primary currency total (of the section's most-common currency; configurable per section)
- Tour-default currency total (using FX rates from a simple lookup)

For FX in v1: hardcode a small lookup table (`{GBP: 1, USD: 1.27, EUR: 1.18, …}`) in `src/lib/budget/fx.ts`. Per-tour FX overrides can be added later via a small admin panel. **This is acknowledged as a v1 simplification; document it.**

---

## 10. Step 6 — Performance

Budget for a long tour can have several hundred rows. SpreadsheetGrid handles up to 5,000 rows so no virtualisation work needed at the page level.

Optimistic update flow:
1. User edits a cell → state updates immediately, totals recompute
2. API call fires
3. On success: confirm state (no visual change)
4. On error: revert cell + toast, totals recompute

Debounce API calls per row at 500ms to avoid flooding on rapid edits.

---

## 11. Step 7 — Verification

1. `npm run lint`, `npm run typecheck` clean
2. `/tours/[id]/budget` renders with new chrome + section sub-nav
3. All 8 sections render with correct columns
4. Inline editing works (keyboard nav, validation, formatting)
5. Derived rows are read-only with link icon; tooltip shows source
6. Adding a row via "+" button works
7. Bulk delete works (select rows + delete key or toolbar)
8. Section totals update immediately on edit
9. Grand total updates immediately
10. Multi-currency totals display correctly
11. Slide-over opens for any row; "Math scratchpad → Set as amount" updates the row's amount
12. Switching tours fetches new lines
13. Performance: 500-row budget feels snappy
14. Visual aesthetic matches Bug Reports (verify side-by-side)
15. **Visibly outclasses the previous Budget page**
16. Dark mode parity

---

## 12. Acceptance criteria

- [ ] Schema migration applied (section + sort_order columns)
- [ ] `BudgetSection` component renders SpreadsheetGrid per section
- [ ] All 8 sections have correct column defs
- [ ] Derived rows for Flight / Hotel / Room / Gear / Person all work
- [ ] Section totals + grand total compute correctly
- [ ] Multi-currency display works
- [ ] `<BudgetLineSlideOver>` with all 6 sections + math scratchpad
- [ ] Old Budget code moved to `_legacy/budget/` (deletion follow-up)
- [ ] Bug Reports aesthetic parity confirmed
- [ ] Lint + typecheck clean
- [ ] No new dependencies

---

## 13. Out of scope

- ❌ Don't add formulas in cells (defer)
- ❌ Don't add paste-from-Excel (defer)
- ❌ Don't add per-tour FX rate overrides UI (defer; hardcoded lookup is v1)
- ❌ Don't redesign other Spreadsheet pages — UX15
- ❌ Don't change Receipt/Expense entity schema — UX19 owns that

---

## 14. Commit plan

Three commits to keep diff manageable:

1. `UX14: Budget — schema migration, section types, column defs`
2. `UX14: Budget — page composition, sections, totals, currency`
3. `UX14: Budget — slide-over with math scratchpad; retire legacy budget code`
