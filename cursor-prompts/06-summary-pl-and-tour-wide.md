# Cursor Prompt 06: Summary P&L + Tour-Wide Costs

## Prerequisites

- Prompts 01-05 completed

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase.

**Existing**: `/api/budget/summary` endpoint already returns pre-computed P&L data. The existing `SummaryTab.tsx` component renders it with bar charts.

**Goal**: Create a Summary view at `/tours/[id]/summary` that matches the Google Sheets P&L layout (single scrollable page with numbers, not charts). Also create the Tour-Wide Costs section accessible from sidebar.

## Part A: Summary P&L

### 1. New route: `/tours/[id]/summary`

Create `src/app/(app)/tours/[id]/summary/page.tsx`:
1. Fetch summary via `GET /api/budget/summary?tour_id={id}`
2. Fetch tour + routing for show/off day counts
3. Render `SummaryView` client component

### 2. SummaryView component

Create `src/components/summary/SummaryView.tsx` ('use client'):

**Layout** (matching Google Sheets SUMMARY exactly):

```
┌──────────────────────────────────────────────────────────────┐
│  [ARTIST NAME]                                               │
│  [TOUR NAME]                                                 │
│  Updated: [timestamp] — [initials]                           │
│                                                              │
│  ═══════════════════════════════════════════════════════════  │
│  INCOME BAR                                                  │
│  ████████████████████████████████████████  £43,600            │
│  EXPENSE BAR                                                 │
│  ██████████████████████████████████████████████  £50,809      │
│  NET P&L                                                     │
│  ▓▓▓▓▓▓ -£7,209                                             │
│  ═══════════════════════════════════════════════════════════  │
│                                                              │
│                    PROPOSED        ACTUAL                     │
│  ─────────────────────────────────────────                   │
│  SALARIES          £14,501.84     £0                         │
│  PER DIEM          £1,307.18      £0                         │
│  HOTEL             £7,000         £0                         │
│  TRANSPORT         £15,136        £0                         │
│  PRODUCTION+MISC   £6,200         £0                         │
│  COMMISSIONS       £4,360         £4,360                     │
│  ACCOUNTANCY (0%)  £0             £2,180                     │
│  INSURANCE (3%)    £1,308         £1,308                     │
│  Contingency (2%)  £996.26        —                          │
│  ─────────────────────────────────────────                   │
│  TOTAL EXPENSES    £50,809.29     £7,848                     │
│  ═════════════════════════════════════════                    │
│  NET P&L           -£7,209.29     £35,752                    │
│  ═════════════════════════════════════════                    │
│                                                              │
│  ── SHOW DAYS: 2  │  OFF DAYS: 4 ────────────────────────── │
│                                                              │
│  ── SALARY TABLE ────────────────────────────────────────── │
│  CREW          SHOW    OFF     #SHOW  #OFF   PROJECTED  #   │
│  TM|Advance    237.50  237.50  1      1.5    796.04     1   │
│  TM             475     475    2      3      3,184.16   1   │
│  PM|Advance    200     200     1      2      804.42     1   │
│  ...                                                         │
│  TOTAL                                      11,552.30        │
│                                                              │
│  BAND         SHOW    OFF     #SHOW  #OFF   PROJECTED  #    │
│  Drums        300     150     2      4      1,608.84    1   │
│  ...                                                         │
│                                                              │
│  ── COMMISSIONS ─────────────────────────────────────────── │
│  TYPE          %      ACTUAL    BASIS                        │
│  Management    0%     £0        Gross                        │
│  Agency        10%    £4,360    Gross                        │
│  Legal         0%     £0        Gross                        │
│  Merch         0%     £0        Merch Gross                  │
│  TOTAL                £4,360                                 │
│                                                              │
│  [Export to Excel]                                           │
└──────────────────────────────────────────────────────────────┘
```

**Health bars at top:**
- Simple CSS `<div>` bars with percentage width relative to the larger of income/expenses
- Income bar: `bg-emerald-500`
- Expense bar: `bg-red-500`
- P&L bar: green if positive, red if negative
- Each bar shows the amount right-aligned

**Expense table:**
- Each row: category label left-aligned, proposed right-aligned, actual right-aligned
- Proposed column: `text-lp-text`
- Actual column: `text-lp-orange` when non-zero, `text-lp-text-tertiary` when zero
- TOTAL row: `font-bold border-t-2 border-lp-border`
- NET P&L row: `text-xl font-bold`, green if positive, red if negative

**Salary table:**
- Split into CREW and BAND sections (based on `person_type` field)
- Columns: Role, Show Rate, Off Rate, # Show Days, # Off Days, Projected, Actual, #
- Projected = (show_days × show_rate + off_days × off_rate) × currency adjustment per math spec §4
- This is READ-ONLY — editing happens in the Payroll or Spreadsheet views

**Commission table:**
- Columns: Type, %, Actual Amount, Basis
- Basis displayed as text: "Gross", "Net", "Merch Gross", etc.
- This is READ-ONLY

**All currency values:** `Intl.NumberFormat('en-GB', { style: 'currency', currency: tour.currency })`

### 3. Export button (placeholder)

Add an "[Export to Excel]" button at the bottom. For now, it shows a toast: "Excel export coming soon." The actual export will be implemented in a future prompt.

## Part B: Tour-Wide Costs

### 1. New route: `/tours/[id]/tour-wide`

Create `src/app/(app)/tours/[id]/tour-wide/page.tsx`:
1. Fetch all budget_line_items where `routing_id IS NULL` (tour-wide items)
2. Fetch budget_settings (for insurance %, contingency %, accountancy %)
3. Fetch budget_commissions
4. Render `TourWideCosts` client component

### 2. TourWideCosts component

Create `src/components/tour-wide/TourWideCosts.tsx` ('use client'):

**Layout:**
```
┌─ TOUR-WIDE COSTS ────────────────────────────────────────────┐
│                                                               │
│  PRODUCTION                                                   │
│  ├ Audio Hire              £2,500     [→]                     │
│  ├ Carnet (12 month)       £1,200     [→]                     │
│  └ Misc Expenses           £500       [→]                     │
│  + Add production item                                        │
│                                                               │
│  TRANSPORT                                                    │
│  ├ Cargo Van Hire          £300       [→]                     │
│  └ ...                                                        │
│  + Add transport item                                         │
│                                                               │
│  OVERHEADS (auto-calculated)                                  │
│  ├ Insurance (3%)          £1,308                             │
│  ├ Contingency (2%)        £996                               │
│  └ Accountancy (0%)        £0                                 │
│  [Edit percentages]                                           │
│                                                               │
│  COMMISSIONS                                                  │
│  ├ Agency (10% of Gross)   £4,360                             │
│  ├ Management (0%)         £0                                 │
│  └ Legal (0%)              £0                                 │
│  + Add commission                                             │
│                                                               │
│  TOTAL TOUR-WIDE:          £10,864                            │
└───────────────────────────────────────────────────────────────┘
```

**Production & Transport sections:**
- Each line item is a row with: label, proposed amount, and [→] icon to open detail panel
- Click amount → InlineEditCell to edit proposed_cost
- "+ Add" button at bottom of each section → creates new line item with routing_id = null
- Items save via `POST /api/budget/line-items` with `{ tour_id, category, label, proposed_cost, routing_id: null }`

**Overheads section:**
- Read-only computed values from budget_settings percentages
- Insurance: insurance_pct × total_expenses
- Contingency: contingency_pct × total_expenses
- Accountancy: accountancy_pct × total_income
- "[Edit percentages]" link opens a small inline form to edit the three percentage values. Save via `PATCH /api/budget/settings`.

**Commissions section:**
- From `budget_commissions` table
- Each row: label, percentage, computed amount, basis
- Percentage is editable (InlineEditCell type: percentage)
- "+ Add commission" creates new row via `POST /api/budget/commissions`

## Files to create

1. `src/app/(app)/tours/[id]/summary/page.tsx`
2. `src/components/summary/SummaryView.tsx`
3. `src/app/(app)/tours/[id]/tour-wide/page.tsx`
4. `src/components/tour-wide/TourWideCosts.tsx`

## Files to modify

1. `src/components/layout/Sidebar.tsx` — add "Summary" under TOUR and "Tour-Wide" under FINANCE

## Do NOT

- Do NOT remove or modify the existing SummaryTab.tsx — it stays for the old budget page
- Do NOT add chart.js or recharts — use plain CSS bars
- Do NOT implement the actual Excel export yet — just the button placeholder
