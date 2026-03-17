# Cursor Prompt 02: Day View & Routing Spine

## Prerequisites

- Prompt 01 (artist-first navigation) must be completed first
- The `ArtistTourContext` must exist and be working

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase.

**Design**: Glass-morphic cards (`backdrop-blur-md bg-white/10 dark:bg-black/20 border border-lp-border rounded-xl`). Orange accents (`lp-orange` = #FF4500). See `DESIGN_SYSTEM.md`.

**Current tour detail page**: `src/app/(app)/tours/[id]/page.tsx` shows tour header + routing editor (grid/calendar/kanban views). This page stays as the "Overview" tab.

**Goal**: Create a new Day View page at `/tours/[id]/day` that shows the tour as a vertical timeline of days. Each day is a collapsible card showing advance info (left/top) and budget line items (right/bottom) side by side.

## What to Build

### 1. New route: `/tours/[id]/day`

Create `src/app/(app)/tours/[id]/day/page.tsx` as a server component that:
1. Fetches the tour: `supabase.from('tours').select('*, artist:artists(*)').eq('id', params.id).single()`
2. Fetches all routing dates: `supabase.from('routing').select('*, venue:venues(*)').eq('tour_id', params.id).order('date')`
3. Passes data to a client component `DayViewTimeline`

### 2. DayViewTimeline component

Create `src/components/day-view/DayViewTimeline.tsx` ('use client'):

**Props:**
```typescript
interface DayViewTimelineProps {
  tour: Tour;
  routingDates: RoutingDate[];
}
```

**Renders:**
- A vertical list of `DayCard` components, one per routing date, sorted by date ascending
- A sticky header showing: tour name, total show days / off days / travel days count, total budget so far
- Each DayCard is collapsible (click to expand/collapse)
- By default, today's date (or the next upcoming date) is expanded, all others collapsed
- URL hash tracks which day is expanded: `#day-2026-05-22`

### 3. DayCard component

Create `src/components/day-view/DayCard.tsx` ('use client'):

**Props:**
```typescript
interface DayCardProps {
  tour: Tour;
  routingDate: RoutingDate;
  isExpanded: boolean;
  onToggle: () => void;
}
```

**Collapsed state** (single row, always visible):
```
┌──────────────────────────────────────────────────────────────┐
│  22 MAY  ●  SHOW   ZEYZEY MIAMI, USA              £25,000 ▾ │
└──────────────────────────────────────────────────────────────┘
```

- Date: `text-lg font-bold` formatted as "22 MAY" (day + short month, uppercase)
- Day type dot: coloured circle using existing `lp-day-show` (#10B981), `lp-day-off` (#6B7280), `lp-day-travel` (#3B82F6) tokens
- Day type label: uppercase, `text-xs font-semibold tracking-wider`
- Venue + city: `text-sm text-lp-text-secondary`
- Income (if show day): right-aligned, `text-sm font-semibold`
- Chevron: rotates on expand

**Expanded state** (two panels):
```
┌─ 22 MAY — SHOW — ZEYZEY MIAMI ──────────────────────────────┐
│                                                               │
│  ┌─ ADVANCE ──────────────┐  ┌─ BUDGET ───────────────────┐  │
│  │  [Tabbed content]      │  │  [Line items for this day] │  │
│  └────────────────────────┘  └─────────────────────────────┘  │
│                                                               │
│  INCOME: £25,000  |  DAY EXPENSES: £5,654  |  DAY P&L: +£19k │
└───────────────────────────────────────────────────────────────┘
```

On mobile (< 768px), stack the panels vertically (advance on top, budget below).

### 4. DayAdvancePanel component

Create `src/components/day-view/DayAdvancePanel.tsx` ('use client'):

**Props:**
```typescript
interface DayAdvancePanelProps {
  tourId: string;
  routingId: string;
}
```

**Behaviour:**
- Fetches advance data: `GET /api/tours/${tourId}/advance/${routingId}`
- Displays a **tabbed interface** within the panel
- Tabs correspond to the advance sections for this routing date (e.g., Schedule, Venue, Contacts, Production, Hospitality)
- Each tab shows the section's fields in a compact, read-only format (label: value pairs)
- Editable fields: click a value → inline edit → blur saves via `PATCH /api/tours/${tourId}/advance/${routingId}` with body `{ data: { [sectionId]: { [fieldId]: newValue } } }`
- Tab styling: horizontal tabs, `text-xs uppercase tracking-wider`, active tab has `border-b-2 border-lp-orange`
- If no advance data exists yet, show: "No advance info yet. [Start advance →]" linking to `/tours/${tourId}/advance/${routingId}`

**API calls (existing endpoints):**
- `GET /api/tours/[id]/advance/[routingId]` — returns `{ advance: AdvanceInstance, form_config: AdvanceFormConfig }`
- `PATCH /api/tours/[id]/advance/[routingId]` — body: `{ data: { [sectionId]: { [fieldId]: value } } }` — merges into existing data

### 5. DayBudgetPanel component

Create `src/components/day-view/DayBudgetPanel.tsx` ('use client'):

**Props:**
```typescript
interface DayBudgetPanelProps {
  tourId: string;
  routingId: string;
  routingDate: RoutingDate;
}
```

**Behaviour:**
- Fetches budget line items for this day: `GET /api/budget/line-items?tour_id=${tourId}&routing_id=${routingId}`
- Also fetches income for this day: `GET /api/budget/income?tour_id=${tourId}&routing_id=${routingId}`
- Also fetches flights, hotels, transport assigned to this routing date
- Displays line items grouped by category (Flights, Hotel, Transport, Production, Misc)
- Each group has a header with category name and subtotal
- Each line item shows: label, proposed cost, actual cost (if entered)
- "+ Add line item" button at the top opens an inline form: description input, category dropdown, amount input
- Saving a new line item: `POST /api/budget/line-items` with body `{ tour_id, routing_id, category, label, proposed_cost, quantity: 1 }`
- Inline editing existing items: click amount → input → blur saves via `PATCH /api/budget/line-items` with body `{ id, proposed_cost }` (or `actual_cost`)
- Bottom of panel: DAY TOTAL (sum of all line items for this date)

**Category grouping:**
```
FLIGHTS (from flight_bookings where departure_date matches)
HOTEL (from hotel_room_assignments where check_in matches, or budget_line_items with category 'hotels')
TRANSPORT (budget_line_items with category starting with 'transport_')
PRODUCTION (budget_line_items with category starting with 'prod_')
MISC (budget_line_items with category 'misc')
PER DIEM (calculated: crew_count × per_diem_rate, from personnel_rates)
```

**API calls (existing endpoints):**
- `GET /api/budget/line-items?tour_id={id}` — filter client-side by routing_id
- `POST /api/budget/line-items` — create new line item
- `PATCH /api/budget/line-items` — update existing
- `DELETE /api/budget/line-items` — delete (with confirmation)
- `GET /api/budget/income?tour_id={id}` — filter by routing_id
- `GET /api/budget/flights?tour_id={id}` — filter by departure_date matching routing date
- `GET /api/budget/hotels?tour_id={id}` — show hotel costs for matching dates

### 6. Day footer: Income + Expenses + P&L

At the bottom of each expanded DayCard, show a summary bar:

```
INCOME: £25,000  |  EXPENSES: £5,654  |  P&L: +£19,346
```

- Income: from `budget_income` for this routing_id (post_tax_guarantee + post_tax_overage + merch_income + vip_income)
- Expenses: sum of all budget_line_items for this routing_id + flight costs + hotel costs for this date
- P&L: Income - Expenses
- Colour: green if positive, red if negative
- For OFF/TRAVEL days with no income: just show "EXPENSES: £X"

## Files to create

1. `src/app/(app)/tours/[id]/day/page.tsx`
2. `src/components/day-view/DayViewTimeline.tsx`
3. `src/components/day-view/DayCard.tsx`
4. `src/components/day-view/DayAdvancePanel.tsx`
5. `src/components/day-view/DayBudgetPanel.tsx`

## Files to modify

1. `src/components/layout/Sidebar.tsx` — add "Day View" link under TOUR section (if not already done in Prompt 01). Link: `/tours/${selectedTourId}/day`

## Files to NOT modify

- Do NOT touch `src/app/(app)/tours/[id]/page.tsx` (the existing tour detail/overview page)
- Do NOT touch any existing budget components in `src/components/budget/`
- Do NOT modify any API routes
- Do NOT modify the database schema
- Do NOT touch the advance section builder (`AdvanceSectionBuilder.tsx`)

## Styling

- DayCard collapsed: `bg-lp-surface/80 backdrop-blur-sm border border-lp-border rounded-lg px-4 py-3 cursor-pointer hover:bg-lp-surface transition-colors`
- DayCard expanded: `bg-lp-surface/60 backdrop-blur-md border border-lp-border rounded-xl p-6`
- Panel containers: `bg-white/5 dark:bg-white/5 rounded-lg p-4 border border-lp-border/50`
- Two-panel layout: `grid grid-cols-1 md:grid-cols-2 gap-4`
- Category headers in budget panel: `text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2`
- Line items: `flex justify-between items-center py-1.5 text-sm`
- Add button: `text-lp-orange text-sm font-semibold hover:underline`
- P&L bar: `flex items-center gap-6 px-4 py-2 bg-lp-surface/40 rounded-lg text-sm font-semibold`

## Animation

- Expand/collapse: CSS transition on max-height (or use a simple boolean + conditional render with `animate-in` class)
- Chevron rotation: `transition-transform duration-200` + `rotate-180` when expanded
- Keep it simple — no spring physics or complex animations

## Do NOT

- Do NOT install any animation libraries (no framer-motion)
- Do NOT create any new API endpoints — use existing ones
- Do NOT add new database tables
- Do NOT make any page a default export of a class component — all functional components
- Do NOT use `getServerSideProps` — this is App Router, use async server components or client-side fetching
