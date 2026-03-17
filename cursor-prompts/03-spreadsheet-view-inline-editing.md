# Cursor Prompt 03: Spreadsheet View with Inline Editing

## Prerequisites

- Prompts 01 and 02 completed
- Artist-first nav and Day View exist

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase.

**Current budget components**: All in `src/components/budget/`. 11 tab components with working CRUD. Most use modal forms or an edit-mode pattern (editingId state, pencil icon, save/cancel buttons). This is clunky.

**Goal**: Create a Spreadsheet View at `/tours/[id]/sheet` that reuses the existing budget tab components but upgrades them with proper inline editing. This is the category-based view (all hotels together, all flights together, etc.) as opposed to the day-based view.

## What to Build

### 1. New route: `/tours/[id]/sheet`

Create `src/app/(app)/tours/[id]/sheet/page.tsx` as a server component:
1. Fetch tour data
2. Accept `?tab=income` (or hotels, flights, transport, production, receipts, commissions) as search param. Default: `income`
3. Render `SpreadsheetView` client component

### 2. SpreadsheetView component

Create `src/components/spreadsheet-view/SpreadsheetView.tsx` ('use client'):

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Routing & Income │ Hotels │ Flights │ Transport │ Prod │ ...│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Grid content for selected tab]                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Horizontal tabs along the top (not a sidebar)
- Tab styling: `text-xs font-semibold uppercase tracking-wider px-3 py-2`, active tab: `border-b-2 border-lp-orange text-lp-orange`, inactive: `text-lp-text-secondary hover:text-lp-text`
- Tabs update URL search param: `?tab=hotels` etc.
- Tab content area renders the corresponding grid component

### 3. Shared InlineEditCell component

Create `src/components/spreadsheet-view/InlineEditCell.tsx` ('use client'):

This is the core building block. Every editable cell in every grid uses this.

```typescript
interface InlineEditCellProps {
  value: string | number | null;
  onSave: (newValue: string | number) => Promise<void>;
  type: 'text' | 'number' | 'currency' | 'percentage' | 'select';
  options?: { value: string; label: string }[]; // for select type
  placeholder?: string;
  readOnly?: boolean;
  align?: 'left' | 'right';
  className?: string;
}
```

**Behaviour:**
- **Display mode**: Shows formatted value as plain text. For `currency`: right-aligned, formatted with `Intl.NumberFormat('en-GB', { style: 'currency', currency })`. For `percentage`: right-aligned, formatted as "10.0%". For `text`: left-aligned.
- **Edit mode**: On click, replaces text with an `<input>` (or `<select>` for select type). Input is auto-focused and auto-selected.
- **Save**: On blur OR Enter key → call `onSave(newValue)`. Show a brief saving indicator (subtle pulse or checkmark). On error, revert to previous value and show red flash.
- **Cancel**: On Escape → revert to display mode without saving.
- **Keyboard nav**: Tab → blur current (saves) + focus next editable cell in the row. This should work naturally via browser tab order.
- **Hover state**: Subtle background change on hover to indicate editability: `hover:bg-lp-orange/5`
- **Read-only cells**: No hover effect, no click behaviour, slightly dimmed text (`text-lp-text-secondary`)

**Styling:**
- Display mode: `px-2 py-1.5 text-sm cursor-pointer rounded`
- Edit mode: `px-2 py-1 text-sm border border-lp-orange rounded bg-transparent outline-none w-full`
- Currency values: `font-[tabular-nums] text-right`

### 4. Grid components for each tab

For EACH of the following tabs, create a new grid component in `src/components/spreadsheet-view/` that replaces the existing tab component's editing pattern with `InlineEditCell`:

#### 4a. IncomeGrid.tsx

**Columns** (matching the Google Sheets ROUTING & INCOME sheet):
| Date | Day Type | Venue | City | Cap | Pre-TX Guarantee | Withholding % | Post-TX Guarantee | Pre-TX Overage | Post-TX Overage | Merch | VIP | Drop Count | Notes |

- Date, Day Type, Venue, City: **read-only** (from routing table)
- Cap, Pre-TX Guarantee, Withholding %: **editable** (InlineEditCell type: number, percentage)
- Post-TX Guarantee: **computed** (Pre-TX × (1 - Withholding/100)), read-only, dimmed
- Pre-TX Overage, Merch, VIP, Drop Count: **editable**
- Post-TX Overage: **computed**, read-only
- Notes: **editable** (text)
- Footer row: **TOTALS** with sums for all numeric columns

**Data source**: `GET /api/budget/income?tour_id={id}` — returns income rows joined with routing
**Save**: `POST /api/budget/income` with `{ routing_id, field: value }` — upserts

#### 4b. HotelsGrid.tsx

**Columns:**
| Hotel Name | City | Check In | Check Out | # Nights | # Rooms | Rate/Night | Projected | Actual | Conf # |

- All editable except Projected (computed: nights × rooms × rate) and # Nights (computed: check_out - check_in)
- Expandable rows showing room assignments underneath
- "+ Add Hotel" empty row at bottom

**Data source**: `GET /api/budget/hotels?tour_id={id}`
**Save**: `POST /api/budget/hotels` (create), `PATCH /api/budget/hotels` (update)

#### 4c. FlightsGrid.tsx

**Columns:**
| Name | Origin | Destination | Proposed | Actual | Departure Date | Airline | Flight # | Leg |

- Grouped by person name (visual separator between people)
- All editable
- "+ Add Flight" empty row at bottom

**Data source**: `GET /api/budget/flights?tour_id={id}`
**Save**: `POST /api/budget/flights` (create), `PATCH /api/budget/flights` (update)

#### 4d. TransportGrid.tsx

**Layout**: 6 category groups in a 3×2 grid (matching the Google Sheet layout):
```
BUS + TRUCK          │  TAXIS              │  MISC TRANSPORT
─────────────────────│─────────────────────│──────────────────
Item  |  #  | P | A  │  Item | # | P | A   │  Item | # | P | A
...                  │  ...                │  ...
TOTAL: £X    £X      │  TOTAL: £X   £X     │  TOTAL: £X   £X
─────────────────────│─────────────────────│──────────────────
FUEL                 │  PARKING            │  TRAVEL AGENT
...                  │  ...                │  ...
```

Each category group is a mini-grid with its own "+ Add" row.

**Data source**: `GET /api/budget/line-items?tour_id={id}&category=transport_*`
**Categories**: `transport_bus`, `transport_taxis`, `transport_misc`, `transport_fuel`, `transport_parking`, `transport_agent`
**Save**: `POST /api/budget/line-items` (create), `PATCH /api/budget/line-items` (update)

#### 4e. ProductionGrid.tsx

Same layout as TransportGrid but with production categories:
```
AUDIO + BACKLINE     │  PROGRAMMING + SETUP │  LIGHTING
SET + WARDROBE       │  FREIGHT + BAGGAGE   │  MISC PRODUCTION
```

**Categories**: `prod_audio`, `prod_programming`, `prod_lighting`, `prod_set_wardrobe`, `prod_freight`, `prod_misc`

#### 4f. ReceiptsGrid.tsx

**Columns:**
| # | Date | Vendor | Category | Description | Payment Method | Cost (Tour) | Cost (Home) | In Budget | Linked Item |

- In Budget: toggle switch (InlineEditCell type: select with options true/false)
- Payment Method: dropdown (card, cash, bank_transfer, company_card)
- Category: dropdown using existing categories
- "+ Add Receipt" empty row at bottom

**Data source**: `GET /api/budget/receipts?tour_id={id}`

#### 4g. CommissionsGrid.tsx

**Columns:**
| Label | Percentage | Basis | Proposed Amount | Actual Amount | Notes |

- Label, Percentage, Basis, Notes: editable
- Proposed/Actual Amount: computed (percentage × income based on basis), read-only
- Basis dropdown options: Gross, Net, Merch Gross, Net Merch, Gross Minus Tax

**Data source**: `GET /api/budget/commissions?tour_id={id}`

### 5. Shared grid table wrapper

Create `src/components/spreadsheet-view/GridTable.tsx`:

```typescript
interface GridTableProps {
  columns: { key: string; label: string; width?: string; align?: 'left' | 'right' }[];
  children: ReactNode; // table body rows
  footer?: ReactNode; // totals row
}
```

Renders a `<table>` with:
- Sticky header row: `bg-lp-surface text-xs font-bold uppercase tracking-wider text-lp-text-secondary`
- `overflow-x-auto` wrapper for horizontal scroll on narrow screens
- Alternating row tint: `even:bg-lp-surface/30`
- Thin borders: `border-b border-lp-border/30`
- Footer row: `font-bold border-t-2 border-lp-border`

## Files to create

1. `src/app/(app)/tours/[id]/sheet/page.tsx`
2. `src/components/spreadsheet-view/SpreadsheetView.tsx`
3. `src/components/spreadsheet-view/InlineEditCell.tsx`
4. `src/components/spreadsheet-view/GridTable.tsx`
5. `src/components/spreadsheet-view/IncomeGrid.tsx`
6. `src/components/spreadsheet-view/HotelsGrid.tsx`
7. `src/components/spreadsheet-view/FlightsGrid.tsx`
8. `src/components/spreadsheet-view/TransportGrid.tsx`
9. `src/components/spreadsheet-view/ProductionGrid.tsx`
10. `src/components/spreadsheet-view/ReceiptsGrid.tsx`
11. `src/components/spreadsheet-view/CommissionsGrid.tsx`

## Files to modify

1. `src/components/layout/Sidebar.tsx` — add "Spreadsheet" link under TOUR section. Link: `/tours/${selectedTourId}/sheet`

## Files to NOT modify

- Do NOT modify the existing budget tab components in `src/components/budget/` — they stay as-is for now. The new grid components exist alongside them.
- Do NOT modify any API routes — all existing endpoints have the exact CRUD operations we need
- Do NOT modify the database schema

## Critical implementation rules

1. **Every API call must include error handling.** If a save fails, revert the cell value and show a red flash (1s, via CSS class toggle). Do NOT silently swallow errors.
2. **Use `Promise.all` for parallel fetches.** When the grid mounts, fetch all needed data in parallel, not sequentially.
3. **Debounce is NOT needed for blur-save.** Blur fires once — just save immediately. Debounce is only needed if you implement keystroke-level saving (we are not doing that).
4. **All money values must use `Intl.NumberFormat`.** Currency code comes from the tour's `currency` field. Format: `new Intl.NumberFormat('en-GB', { style: 'currency', currency: tour.currency, minimumFractionDigits: 2 })`.
5. **Computed cells must recalculate on every render.** Post-TX guarantee = Pre-TX × (1 - withholding/100). Do this in the component, not via API.
6. **Empty/null values display as "—"** (em dash), not "0" or blank.

## Do NOT

- Do NOT install TanStack Table, AG Grid, or any grid library. Build with plain `<table>` elements and the InlineEditCell component. Keep it simple.
- Do NOT add pagination — budget grids are small (10-50 rows max). Render all rows.
- Do NOT add sorting or filtering yet — that's future work.
- Do NOT create separate CSS files — Tailwind only.
- Do NOT use `useEffect` for data fetching in client components when a server component can fetch and pass as props. Use server components for initial data load where possible.
