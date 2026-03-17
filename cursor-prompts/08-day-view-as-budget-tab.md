# Prompt 08 — Day View as Budget Tab + Remove Duplicate Pages

## Context

Ben's budget system lives at `/budget?tour_id=XXX&tab=YYY`. It has 11 tabs defined in
`src/components/budget/budget-tabs.ts` and rendered in `src/components/budget/BudgetTabs.tsx`.
The tab nav rail is in `BudgetTabsNav` (same file).

We previously built a Day View (`src/app/(app)/tours/[id]/day/page.tsx` + `src/components/day-view/`)
and duplicate Spreadsheet/Summary/Tour-Wide pages. These need to be:
1. Day View → ported as a new `day-view` tab inside Ben's budget system
2. Duplicate Spreadsheet/Summary/Tour-Wide pages → redirect to Ben's budget

## Design rules (MUST follow exactly)

- Match Ben's existing budget design language throughout:
  - Warm neutral background: `var(--lp-budget-wrap-bg)` (`#FAFAF9` light / `#13100e` dark)
  - Border: `var(--lp-budget-wrap-border)`
  - Text: `text-lp-text`, `text-lp-text-secondary`, `text-lp-text-tertiary`
  - Section headers: `text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary`
  - Values: `tabular-nums font-bold`
  - Cards: `rounded-xl border border-lp-border bg-lp-surface/50 p-4`
  - Orange accent: `#FF4500` / `lp-orange`
  - NO hardcoded grays. NO `bg-gray-*`. NO `text-gray-*`. Use the design token variables.

## Task 1 — Add `day-view` tab to budget system

### 1a. Update `src/components/budget/budget-tabs.ts`

Add after `income`:
```ts
{ id: 'day-view', label: 'Day View' },
```

### 1b. Add icon in `src/components/budget/BudgetTabs.tsx`

In the `ICONS` record, add:
```ts
'day-view': <CalendarDays className="h-4 w-4" />,
```
Import `CalendarDays` from `lucide-react`.

Also add the case to the `tabContent()` switch:
```ts
case 'day-view': return <DayViewTab tourId={tourId} />;
```
Import `DayViewTab` dynamically:
```ts
const DayViewTab = dynamic(
  () => import('@/components/budget/DayViewTab').then((m) => ({ default: m.DayViewTab })),
  { ssr: false }
);
```

### 1c. Create `src/components/budget/DayViewTab.tsx`

This is a client component (`'use client'`). It fetches its own data.

**Layout:**
- Horizontal scrollable day strip across the top (like a calendar header)
- Selected day shows a two-panel detail below:
  - LEFT panel: Advance info for the day (tabbed: Venue / Logistics / Contacts / Notes)
  - RIGHT panel: Day financials — income items + expenses for that day

**Day strip (top):**
- Horizontal flex, overflow-x-auto, no-scrollbar
- Each day is a pill/chip: `rounded-lg px-3 py-2 text-xs font-medium cursor-pointer`
- Active day: `bg-lp-orange text-white`
- Inactive: `bg-lp-surface border border-lp-border text-lp-text-secondary hover:bg-lp-surface-hover`
- Show: day number (e.g. "14"), abbreviated month above ("MAR"), day type below ("SHOW" / "OFF" / "TRAVEL")
- Day type colors: SHOW → green dot, OFF → gray dot, TRAVEL → blue dot
- First day auto-selected on load

**Data to fetch for the strip:**
```ts
GET /api/tours/[tourId]/routing  // or query routing table directly
// Returns: { id, date, day_type, venue: { name, city, country } }
```
Use `fetch('/api/routing?tour_id=' + tourId)` — check if this API exists first.
If it doesn't exist, query via a client-side fetch to a new API route:
Create `src/app/api/routing/route.ts` that queries:
```sql
SELECT r.*, v.name as venue_name, v.city, v.country
FROM routing r LEFT JOIN venues v ON r.venue_id = v.id
WHERE r.tour_id = $tourId AND r.workspace_id = get_my_workspace_id()
ORDER BY r.date ASC
```

**LEFT panel — Advance info tabs:**
Source data from the `advance_form_configs` table for the selected routing date.
Tabs: Venue, Logistics, Contacts, Notes
Match the visual style of `src/app/(app)/tours/[id]/advance/` — same tabbed layout and field display.
Use `rounded-xl border border-lp-border bg-lp-surface/50 p-4` for the container.
If no advance data: show empty state with `text-lp-text-tertiary text-sm`.

**RIGHT panel — Day financials:**

Section header style: `text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary mb-3`

**Income block** — show from `budget_income` table where `routing_id = selectedDayId`:
Columns: Description | Proposed | Actual | Variance
Relevant income types for a show day:
- Guarantee
- Soft cap / hard cap
- Break percentage
- Withholding tax (shown as deduction, red)
- Overage
- Merch income
- Ticket income / NOS

**Expense block** — show from `budget_line_items` table where `routing_id = selectedDayId`:
Group by category. Each group has a header and rows.
Columns: Description | Proposed | Actual | Status chip

**Footer row** for each panel: `Day P/L = income total - expense total`
Color: green if positive, red if negative.

Both panels use the same table style as Ben's other tabs:
- `grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem]`
- Header row: `text-[11px] font-semibold text-lp-text-tertiary`
- Data rows: `text-[13px] tabular-nums`
- Sticky table header: `sticky top-0 bg-lp-budget-wrap-bg`

If a day has no routing entry (i.e. day type is OFF/TRAVEL with no venue), hide the venue panel and show a simple "No show" card.

**Empty state:** If the tour has no routing dates, show a centered card:
```
<div class="flex flex-col items-center justify-center h-64 text-lp-text-tertiary text-sm gap-2">
  No routing dates. Add routing to see the day view.
</div>
```

---

## Task 2 — Redirect duplicate pages to budget

### 2a. Replace `src/app/(app)/tours/[id]/sheet/page.tsx`

Replace entire file content with a redirect:
```ts
import { redirect } from 'next/navigation';
export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/budget?tour_id=${id}`);
}
```

### 2b. Replace `src/app/(app)/tours/[id]/summary/page.tsx`

```ts
import { redirect } from 'next/navigation';
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/budget?tour_id=${id}&tab=summary`);
}
```

### 2c. Replace `src/app/(app)/tours/[id]/tour-wide/page.tsx`

```ts
import { redirect } from 'next/navigation';
export default async function TourWidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/budget?tour_id=${id}`);
}
```

---

## Task 3 — Fix Overview page (tour detail)

`src/app/(app)/tours/[id]/page.tsx` currently shows a routing editor — making it look like
a routing page, not an overview/dashboard.

Remove the `<RoutingEditor />` component from this page.

Replace the routing editor section with a simple tour dashboard showing:
1. Tour header: artist name, tour name, date range, status badge (existing code, keep this)
2. Stats row (4 cards, match Ben's card style `rounded-xl border border-lp-border bg-lp-surface/50 p-4`):
   - Total shows (count of SHOW routing dates)
   - Total days (count of all routing dates)
   - Advance completion % (count of routing dates with advance data / total)
   - Days until tour starts (or "Tour in progress" if active)
3. Quick links section: 3 buttons → Routing, Advance, Budget (href to `/budget?tour_id=XXX`)

Do NOT remove the back link or the tour header. Keep existing Supabase queries, just
remove the routing editor render and replace with the stats cards.

---

## Do NOT modify

- `src/components/budget/SummaryTab.tsx`
- `src/components/budget/BudgetTourLanding.tsx`
- `src/components/budget/BudgetTourSelector.tsx`
- Any other existing Ben budget tab files
- `src/app/(app)/budget/page.tsx` (already restructured)
- `src/components/layout/Sidebar.tsx` (already fixed)
