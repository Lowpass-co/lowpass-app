# Cursor Prompt 05: Payroll & Rooming

## Prerequisites

- Prompts 01-04 completed
- Artist-first nav, Day View, Spreadsheet View, Detail Panel all exist
- ArtistTourContext provides selectedTourId

## Context

**Stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase.

**Existing tables**: `personnel_rates`, `payroll_entries`, `rooming_grid`, `hotel_bookings`, `hotel_room_assignments` — all exist with full CRUD APIs.

**Existing API routes**: `/api/budget/personnel-rates`, `/api/budget/payroll`, `/api/budget/payroll/generate`, `/api/budget/hotels`, `/api/budget/hotels/assignments`

**Goal**: Build payroll weekly sheets and rooming master grid that match the Google Sheets format. These live in the sidebar under FINANCE, accessible via `/tours/[id]/payroll` and `/tours/[id]/rooming`.

## Part A: Payroll

### 1. New route: `/tours/[id]/payroll`

Create `src/app/(app)/tours/[id]/payroll/page.tsx`:
1. Fetch tour, routing dates, personnel_rates, payroll_entries in parallel
2. Render `PayrollView` client component

### 2. PayrollView component

Create `src/components/payroll/PayrollView.tsx` ('use client'):

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Summary │ WC 18 May │ WC 25 May │                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Selected tab content]                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Tab generation logic:**
- Tab 1: always "Summary"
- Remaining tabs: auto-generated from routing dates
- Group routing dates into ISO weeks (Monday start)
- For each week that has at least one routing date: create a tab labelled "WC {day} {month}" (e.g., "WC 18 May")
- Tab order: chronological

### 3. PayrollSummary component

Create `src/components/payroll/PayrollSummary.tsx` ('use client'):

**Grid columns** (matching the Google Sheets PAYROLL SUMMARY):
| Role | Forename | Surname | Show Rate | Travel Rate | Per Diem | Show Days | Off/Travel Days | Total Fee | Per Diem Rate | Total Per Diem |

- Role, Forename, Surname, Show Rate, Travel Rate, Per Diem Rate: from `personnel_rates` table. Editable via InlineEditCell.
- Show Days, Off/Travel Days: **computed** from routing dates × payroll entries. Read-only.
- Total Fee: **computed** (show_days × show_rate + off_days × off_rate + advance_fee). Read-only.
- Total Per Diem: **computed** (total_days × per_diem). Read-only.
- Footer: TOTALS row summing Total Fee and Total Per Diem columns.

**Data**: `GET /api/budget/personnel-rates?tour_id={id}` for rates. Count show/off days from routing table.

### 4. PayrollWeekSheet component

Create `src/components/payroll/PayrollWeekSheet.tsx` ('use client'):

**Props:**
```typescript
interface PayrollWeekSheetProps {
  tourId: string;
  weekStart: string; // ISO date of Monday
  personnelRates: PersonnelRate[];
  routingDates: RoutingDate[];
  payrollEntries: PayrollEntry[];
}
```

**Grid layout** (matching Google Sheets weekly payroll):

Header rows:
- Row 0 (dates): blank | blank | blank | Mon date | Tue date | Wed date | Thu date | Fri date | Sat date | Sun date | Advance | Total Fee | Total PD | Notes
- Row 1 (venues): blank | blank | blank | venue or "-" | venue or "-" | ... (from routing, show venue_name if show day)
- Row 2 (cities): blank | blank | blank | city | city | ... (from routing)

Data rows (one per person):
| Role | Forename | Surname | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Advance | Total Fee | Total PD | Notes |

**Day cells**: Each day cell is a dropdown (InlineEditCell type: select) with options:
- `SHOW DAY` — green background (`bg-emerald-500/20 text-emerald-700 dark:text-emerald-400`)
- `OFF/TRAVEL DAY` — amber background (`bg-amber-500/20 text-amber-700 dark:text-amber-400`)
- `NO TOUR` — grey background (`bg-gray-500/10 text-gray-500`)

**Auto-population:** When the sheet first renders for a person, check if payroll_entries exist for this week. If not, auto-populate based on routing:
- If routing has a date within this week: set day_type based on routing.day_type (show → SHOW DAY, off/travel → OFF/TRAVEL DAY)
- If no routing for that date: NO TOUR
- Save auto-populated entries via `POST /api/budget/payroll` or `POST /api/budget/payroll/generate`

**Advance column**: Shows advance_fee from personnel_rates for crew roles (TM Advance, PM Advance). Editable.

**Total Fee**: Computed per person for this week only: (show_days_this_week × show_rate) + (off_days_this_week × off_rate) + advance_fee_if_applicable

**Total PD**: Computed: working_days_this_week × per_diem_rate

**Saving**: When a day status dropdown changes, save via `PATCH /api/budget/payroll` with updated `day_statuses` JSON for that week's payroll_entry. The `day_statuses` field is a JSONB object: `{ "2026-05-21": "off", "2026-05-22": "show", ... }`.

### 5. Footer totals per week

Below the week grid, show:
```
Week Total Fee: £X,XXX    Week Total PD: £XXX
```

## Part B: Rooming

### 1. New route: `/tours/[id]/rooming`

Create `src/app/(app)/tours/[id]/rooming/page.tsx`:
1. Fetch tour, routing dates, rooming_grid entries, hotel_bookings, personnel_rates in parallel
2. Render `RoomingView` client component

### 2. RoomingView component

Create `src/components/rooming/RoomingView.tsx` ('use client'):

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Master Grid │ Hotel 1 │ Hotel 2 │ ...                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Selected tab content]                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Tab 1: Master Grid (always shown)
Remaining tabs: one per hotel_booking, labelled with hotel name + city

### 3. RoomingMasterGrid component

Create `src/components/rooming/RoomingMasterGrid.tsx` ('use client'):

**Grid layout** (matching Google Sheets MASTER rooming):

Header rows:
- Row 0 (cities): blank | blank | blank | City 1 | City 2 | City 3 | ... (from routing, one column per routing date)
- Row 1 (day types): blank | blank | blank | SHOW | OFF | SHOW | ... (from routing)
- Row 2 (dates): Role | Forename | Surname | 21 May | 22 May | 23 May | ...

Data rows (one per person from personnel_rates):
| Role | Forename | Surname | cell | cell | cell | ...

**Each cell** is a dropdown (InlineEditCell type: select) with options:
- `SGL` — single room
- `DBL (A)` — double room pair A
- `DBL (B)` — double room pair B
- `DBL (C)` — double room pair C
- `DBL (D)` — double room pair D
- `—` — not staying (dash)

Cell colours:
- SGL: `bg-blue-500/10`
- DBL (A/B/C/D): `bg-purple-500/10`
- `—`: no background

**Top-of-grid info:**
```
Assumed Rate: £[editable] /Room     Est Total: £[computed]
Updated: [timestamp] — [user initials]
```

Est Total = count of non-dash cells × assumed_rate

**Data source**: `GET /api/budget/rooming-grid?tour_id={id}` (if this endpoint doesn't exist, query Supabase directly: `supabase.from('rooming_grid').select('*').eq('tour_id', tourId)`)

**Saving**: When a cell changes, upsert to `rooming_grid` via Supabase: `supabase.from('rooming_grid').upsert({ tour_id, person_name, role, routing_id, room_type })` with conflict on `(tour_id, person_name, routing_id)`.

### 4. RoomingHotelSheet component

Create `src/components/rooming/RoomingHotelSheet.tsx` ('use client'):

**Props:**
```typescript
interface RoomingHotelSheetProps {
  hotelBooking: HotelBooking;
  roomAssignments: HotelRoomAssignment[];
}
```

**Layout** (matching Google Sheets BLANK HOTEL SHEET):

Header section:
```
HOTEL: [hotel_name]                    Distance to Venue: [editable]
ADDRESS: [address]                     Distance to Airport: [editable]
T: [phone]
CANCELLATION: [cancellation_policy]
```

All header fields editable via InlineEditCell. Save via `PATCH /api/budget/hotels`.

Grid:
| No. | Name | Check In | Check Out | Nights | Room Type | Room No. | Notes | Conf Number | Rate/Night | Total |

- No.: auto-incrementing row number, read-only
- Nights: computed (check_out - check_in), read-only
- Total: computed (nights × rate_per_night), read-only
- All others: editable
- "+ Add person" empty row at bottom
- Footer: TOTALS row (sum of Nights, sum of Total)

**Data source**: `GET /api/budget/hotels/assignments?hotel_booking_id={id}`
**Saving**: `POST /api/budget/hotels/assignments` (create), `PATCH /api/budget/hotels/assignments` (update)

## Files to create

1. `src/app/(app)/tours/[id]/payroll/page.tsx`
2. `src/components/payroll/PayrollView.tsx`
3. `src/components/payroll/PayrollSummary.tsx`
4. `src/components/payroll/PayrollWeekSheet.tsx`
5. `src/app/(app)/tours/[id]/rooming/page.tsx`
6. `src/components/rooming/RoomingView.tsx`
7. `src/components/rooming/RoomingMasterGrid.tsx`
8. `src/components/rooming/RoomingHotelSheet.tsx`

## Files to modify

1. `src/components/layout/Sidebar.tsx` — add "Payroll" and "Rooming" links under FINANCE. Payroll: `/tours/${selectedTourId}/payroll`. Rooming: `/tours/${selectedTourId}/rooming`.

## Files to NOT modify

- Do NOT modify existing budget API routes
- Do NOT modify the existing `/rooming` page (it still works as a standalone with tour selector)
- Do NOT modify existing payroll/rooming components in `src/components/budget/`

## Do NOT

- Do NOT install date libraries (date-fns, moment, luxon) — use native Date and Intl.DateTimeFormat
- Do NOT add drag-and-drop for reordering people
- Do NOT add print functionality yet
- Do NOT create new database tables — all needed tables exist
