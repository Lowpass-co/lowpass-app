# Tour Summary Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tour Summary" dashboard page at `/tours/{id}/overview` that gives a per-tour overview of Budget, Advance, Settlement, Rooming, and Payroll in a 3+2 card grid, with a hero bar at the top.

**Architecture:** Server component (`page.tsx`) fetches all data and computes aggregates, passing typed props to `TourOverviewClient`. Each of the 5 sections is a focused card component. Pure aggregation logic lives in `overview-utils.ts`. The Sidebar gets `MANAGE → MANAGE TOUR` and the new Tour Summary nav item.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (server client), HeroUI, Tailwind CSS, Lucide React

---

## Key Data Patterns

Before starting, understand these Supabase table relationships (critical for the server queries):

| Table | Keyed by | How to query for a tour |
|---|---|---|
| `routing` | `tour_id` | `.eq('tour_id', tourId)` |
| `budget_line_items` | `tour_id` | `.eq('tour_id', tourId)` |
| `hotel_bookings` | `tour_id` + `workspace_id` | `.eq('tour_id', tourId).eq('workspace_id', tour.workspace_id)` |
| `personnel_rates` | `tour_id` | `.eq('tour_id', tourId)` |
| `payroll_entries` | `tour_id` | `.eq('tour_id', tourId)` |
| `budget_income` | `routing_id` only | Fetch routing first, then `.in('routing_id', routingIds)` |
| `settlements` | `routing_id` only | Fetch routing first, then `.in('routing_id', routingIds)` |
| `advance_instances` | `routing_id` only | Fetch routing first, then `.in('routing_id', routingIds)` |

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/components/layout/Sidebar.tsx` | Rename MANAGE → MANAGE TOUR; add Tour Summary nav item |
| Create | `src/components/tour-overview/overview-utils.ts` | Pure aggregation functions + `TourOverviewProps` type |
| Create | `src/app/(app)/tours/[id]/overview/page.tsx` | Server component: all 9 queries + passes computed data to client |
| Create | `src/components/tour-overview/TourHeroBar.tsx` | Hero bar: artist, tour name, dates, status, show count |
| Create | `src/components/tour-overview/BudgetSummaryCard.tsx` | Budget P&L card |
| Create | `src/components/tour-overview/AdvanceSummaryCard.tsx` | Advance progress card |
| Create | `src/components/tour-overview/SettlementSummaryCard.tsx` | Settlement card with scrollable recent shows |
| Create | `src/components/tour-overview/RoomingSummaryCard.tsx` | Rooming coverage card |
| Create | `src/components/tour-overview/PayrollSummaryCard.tsx` | Payroll cost card |
| Create | `src/components/tour-overview/TourOverviewClient.tsx` | Client component: assembles hero + 3+2 card grid |

---

## Task 1: Sidebar — Rename MANAGE and Add Tour Summary

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

The `Gauge` icon from Lucide is not yet imported — add it. The `LayoutDashboard` icon is already in use for "Dashboard" in the OVERVIEW group, so use `Gauge` for Tour Summary to differentiate.

- [ ] **Step 1: Add `Gauge` to the Lucide import on line 14**

Change:
```ts
import {
  ChevronLeft, ChevronRight, LogOut, ChevronDown, X,
  LayoutDashboard, ListMusic, ClipboardList, LineChart,
  Wallet, HandCoins, Bed, FileCheck2, Music, Users, Building2, Settings, Bug,
} from 'lucide-react';
```
To:
```ts
import {
  ChevronLeft, ChevronRight, LogOut, ChevronDown, X,
  LayoutDashboard, ListMusic, ClipboardList, LineChart,
  Wallet, HandCoins, Bed, FileCheck2, Music, Users, Building2, Settings, Bug,
  Gauge,
} from 'lucide-react';
```

- [ ] **Step 2: Add `'tour_overview'` to the `activeMode` union on line 28**

Change:
```ts
activeMode?: 'exact' | 'includes' | 'budget' | 'settlement' | 'never' | 'all_advances' | 'tour_advance' | 'rooming' | 'payroll';
```
To:
```ts
activeMode?: 'exact' | 'includes' | 'budget' | 'settlement' | 'never' | 'all_advances' | 'tour_advance' | 'rooming' | 'payroll' | 'tour_overview';
```

- [ ] **Step 3: Update the group title string at line 95 and add Tour Summary as the first item**

Change:
```ts
{
  title: 'MANAGE',
  items: [
    { label: 'Budget', href: selectedTourId ? `/budget?tour_id=${selectedTourId}` : '/budget', icon: Wallet, activeMode: 'budget' },
```
To:
```ts
{
  title: 'MANAGE TOUR',
  items: [
    { label: 'Tour Summary', href: selectedTourId ? `/tours/${selectedTourId}/overview` : '/tours', icon: Gauge, activeMode: 'tour_overview' },
    { label: 'Budget', href: selectedTourId ? `/budget?tour_id=${selectedTourId}` : '/budget', icon: Wallet, activeMode: 'budget' },
```

- [ ] **Step 4: Update the 3 conditional checks that reference `'MANAGE'`**

Line 230 — change:
```ts
{group.title && !collapsed && group.title !== 'MANAGE' && (
```
To:
```ts
{group.title && !collapsed && group.title !== 'MANAGE TOUR' && (
```

Line 239 — change:
```ts
{group.title === 'MANAGE' && !collapsed && (
```
To:
```ts
{group.title === 'MANAGE TOUR' && !collapsed && (
```

Line 278 — change:
```ts
{group.title === 'MANAGE' && !collapsed && (
```
To:
```ts
{group.title === 'MANAGE TOUR' && !collapsed && (
```

- [ ] **Step 5: Add the `tour_overview` isActive detection branch**

In the `isActive` ternary chain (around line 400), after the `payroll` branch and before the `settlement` branch, insert:

```ts
: item.activeMode === 'tour_overview'
  ? /^\/tours\/[^/]+\/overview(?:\/|$)/.test(pathname ?? '')
```

The full section should read:
```ts
const isActive =
  item.activeMode === 'never'
    ? false
    : item.activeMode === 'all_advances'
      ? pathname === '/advance'
      : item.activeMode === 'tour_advance'
        ? /^\/tours\/[^/]+\/advance(?:\/|$)/.test(pathname ?? '')
        : item.activeMode === 'rooming'
          ? (pathname === '/rooming' || /^\/tours\/[^/]+\/rooming(?:\/|$)/.test(pathname ?? ''))
          : item.activeMode === 'payroll'
            ? /^\/tours\/[^/]+\/payroll(?:\/|$)/.test(pathname ?? '')
            : item.activeMode === 'tour_overview'
              ? /^\/tours\/[^/]+\/overview(?:\/|$)/.test(pathname ?? '')
          : item.activeMode === 'settlement'
          ? pathname?.startsWith('/budget') && tab === 'settlement'
          : item.activeMode === 'budget'
            ? pathname?.startsWith('/budget') && tab !== 'settlement'
            : item.activeMode === 'includes'
              ? !!pathname?.includes(hrefPath.split('/').pop() ?? '')
              : /* exact */ pathname === hrefPath;
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd "/Users/bq/Lowpass Local/lowpass-app-1" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors related to Sidebar.tsx

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(nav): rename MANAGE to MANAGE TOUR and add Tour Summary nav item"
```

---

## Task 2: Aggregation Utilities + TypeScript Types

**Files:**
- Create: `src/components/tour-overview/overview-utils.ts`

This file contains the `TourOverviewProps` interface and 5 pure functions that transform raw Supabase query results into typed props for each card. No side effects, no async.

- [ ] **Step 1: Create the file**

```ts
// src/components/tour-overview/overview-utils.ts

import type { AdvanceFlag } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TourHeroData {
  showCount: number;
  daysUntilStart: number | null;
  daysRemaining: number | null;
  inProgress: boolean;
}

export interface BudgetCardData {
  proposedIncome: number;
  actualIncome: number;
  proposedExpenses: number;
  actualExpenses: number;
}

export interface AdvanceCardData {
  total: number;
  complete: number;
  inProgress: number;
  notStarted: number;
  needsReview: number;
  criticalFlags: number;
  highFlags: number;
  nextShow: { date: string; venueName: string } | null;
}

export interface SettlementCardData {
  reconciledRevenue: number;
  reconciled: number;
  dayOfComplete: number;
  pending: number;
  missingCount: number;
  recentShows: { date: string; venueName: string; status: string }[];
}

export interface RoomingCardData {
  nightsCovered: number;
  totalNights: number;
  assignedCount: number;
  nextCheckIn: { hotelName: string; date: string } | null;
  gapCount: number;
}

export interface PayrollCardData {
  costToDate: number;
  perDiemTotal: number;
  weeksEntered: number;
  totalWeeks: number;
  crewCount: number;
  bandCount: number;
  projectedTotal: number;
}

export interface TourOverviewData {
  heroData: TourHeroData;
  budgetData: BudgetCardData | null;
  advanceData: AdvanceCardData | null;
  settlementData: SettlementCardData | null;
  roomingData: RoomingCardData | null;
  payrollData: PayrollCardData | null;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

interface RawIncome {
  post_tax_guarantee?: number | null;
  post_tax_overage?: number | null;
  merch_income?: number | null;
  vip_income?: number | null;
  actual_guarantee?: number | null;
  actual_overage?: number | null;
  actual_merch?: number | null;
  actual_vip?: number | null;
}

interface RawLineItem {
  proposed_cost?: number | null;
  actual_cost?: number | null;
}

export function computeBudgetData(
  income: RawIncome[],
  lineItems: RawLineItem[]
): BudgetCardData | null {
  if (income.length === 0 && lineItems.length === 0) return null;

  const n = (v: number | null | undefined) => Number(v) || 0;

  const proposedIncome = income.reduce(
    (sum, r) => sum + n(r.post_tax_guarantee) + n(r.post_tax_overage) + n(r.merch_income) + n(r.vip_income),
    0
  );
  const actualIncome = income.reduce(
    (sum, r) => sum + n(r.actual_guarantee) + n(r.actual_overage) + n(r.actual_merch) + n(r.actual_vip),
    0
  );
  const proposedExpenses = lineItems.reduce((sum, r) => sum + n(r.proposed_cost), 0);
  const actualExpenses = lineItems.reduce((sum, r) => sum + n(r.actual_cost), 0);

  return { proposedIncome, actualIncome, proposedExpenses, actualExpenses };
}

// ─── Advance ──────────────────────────────────────────────────────────────────

interface RawAdvanceInstance {
  routing_id: string;
  status: string;
  flags?: AdvanceFlag[] | null;
}

interface RawRouting {
  id: string;
  date: string;
  venue_name?: string | null;
  day_type?: string | null;
}

export function computeAdvanceData(
  instances: RawAdvanceInstance[],
  routing: RawRouting[]
): AdvanceCardData | null {
  if (instances.length === 0) return null;

  const statusCount = (s: string) => instances.filter((i) => i.status === s).length;
  const allFlags = instances.flatMap((i) => i.flags ?? []);
  const criticalFlags = allFlags.filter((f) => f.severity === 'critical').length;
  const highFlags = allFlags.filter((f) => f.severity === 'high').length;

  const instanceMap = new Map(instances.map((i) => [i.routing_id, i]));
  const nextShow =
    routing
      .filter((r) => (r.day_type === 'show' || r.day_type === 'festival'))
      .sort((a, b) => a.date.localeCompare(b.date))
      .find((r) => {
        const inst = instanceMap.get(r.id);
        return !inst || inst.status !== 'complete';
      }) ?? null;

  return {
    total: instances.length,
    complete: statusCount('complete'),
    inProgress: statusCount('in_progress'),
    notStarted: statusCount('not_started'),
    needsReview: statusCount('needs_review'),
    criticalFlags,
    highFlags,
    nextShow: nextShow ? { date: nextShow.date, venueName: nextShow.venue_name ?? '—' } : null,
  };
}

// ─── Settlement ───────────────────────────────────────────────────────────────

interface RawSettlement {
  routing_id: string;
  status?: string | null;
  reconciled_guarantee?: number | null;
  reconciled_overage?: number | null;
}

export function computeSettlementData(
  settlements: RawSettlement[],
  routing: RawRouting[],
  today: Date
): SettlementCardData | null {
  const pastRouting = routing.filter(
    (r) => (r.day_type === 'show' || r.day_type === 'festival') && new Date(r.date) < today
  );
  if (pastRouting.length === 0 && settlements.length === 0) return null;

  const n = (v: number | null | undefined) => Number(v) || 0;
  const settledMap = new Map(settlements.map((s) => [s.routing_id, s]));

  const reconciledRevenue = settlements
    .filter((s) => s.status === 'reconciled')
    .reduce((sum, s) => sum + n(s.reconciled_guarantee) + n(s.reconciled_overage), 0);

  const countByStatus = (status: string) => settlements.filter((s) => s.status === status).length;

  const missingCount = pastRouting.filter((r) => {
    const s = settledMap.get(r.id);
    return !s || s.status === 'pending';
  }).length;

  const recentShows = routing
    .filter((r) => r.day_type === 'show' || r.day_type === 'festival')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((r) => {
      const s = settledMap.get(r.id);
      return {
        date: r.date,
        venueName: r.venue_name ?? '—',
        status: s?.status ?? 'pending',
      };
    });

  return {
    reconciledRevenue,
    reconciled: countByStatus('reconciled'),
    dayOfComplete: countByStatus('day_of_complete'),
    pending: settlements.filter((s) => !s.status || s.status === 'pending').length,
    missingCount,
    recentShows,
  };
}

// ─── Rooming ──────────────────────────────────────────────────────────────────

interface RawHotelBooking {
  hotel_name: string;
  check_in_date?: string | null;
  check_out_date?: string | null;
  city?: string | null;
  hotel_room_assignments?: { id: string }[];
}

export function computeRoomingData(
  hotels: RawHotelBooking[],
  routing: RawRouting[],
  personnelRates: { person_type?: string }[],
  today: Date
): RoomingCardData | null {
  if (hotels.length === 0 && routing.length === 0) return null;

  const showNights = routing.filter(
    (r) => r.day_type === 'show' || r.day_type === 'festival' || r.day_type === 'off_travel'
  );
  const totalNights = showNights.length;

  // A night is "covered" if at least one hotel's check_in → check_out range includes that date
  const nightsCovered = showNights.filter((r) =>
    hotels.some((h) => {
      if (!h.check_in_date || !h.check_out_date) return false;
      return r.date >= h.check_in_date && r.date < h.check_out_date;
    })
  ).length;

  const gapCount = totalNights - nightsCovered;
  const assignedCount = hotels.reduce((sum, h) => sum + (h.hotel_room_assignments?.length ?? 0), 0);

  const nextCheckIn =
    hotels
      .filter((h) => h.check_in_date && h.check_in_date >= today.toISOString().slice(0, 10))
      .sort((a, b) => (a.check_in_date ?? '').localeCompare(b.check_in_date ?? ''))
      .map((h) => ({ hotelName: h.hotel_name, date: h.check_in_date! }))[0] ?? null;

  return { nightsCovered, totalNights, assignedCount, nextCheckIn, gapCount };
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

interface RawPayrollEntry {
  week_start: string;
  total_fee?: number | null;
  total_per_diem?: number | null;
}

interface RawPersonnelRate {
  person_type?: string | null;
  show_rate?: number | null;
  off_rate?: number | null;
  per_diem?: number | null;
}

export function computePayrollData(
  entries: RawPayrollEntry[],
  rates: RawPersonnelRate[],
  routing: RawRouting[]
): PayrollCardData | null {
  if (rates.length === 0 && entries.length === 0) return null;

  const n = (v: number | null | undefined) => Number(v) || 0;

  const costToDate = entries.reduce((sum, e) => sum + n(e.total_fee) + n(e.total_per_diem), 0);
  const perDiemTotal = entries.reduce((sum, e) => sum + n(e.total_per_diem), 0);

  const weeksEntered = new Set(entries.map((e) => e.week_start)).size;

  // Total tour weeks: derive from routing date range
  let totalWeeks = 0;
  if (routing.length > 0) {
    const sorted = [...routing].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = new Date(sorted[0].date);
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const days = Math.ceil((lastDate.getTime() - firstDate.getTime()) / 86400000);
    totalWeeks = Math.ceil(days / 7) + 1;
  }

  const crewCount = rates.filter((r) => r.person_type === 'crew').length;
  const bandCount = rates.filter((r) => r.person_type === 'band' || r.person_type === 'principal').length;

  // Projected total: average weekly cost per person × total weeks
  const avgWeeklyCost = rates.reduce(
    (sum, r) => sum + (n(r.show_rate) + n(r.off_rate)) / 2 + n(r.per_diem) * 7,
    0
  );
  const projectedTotal = avgWeeklyCost * totalWeeks;

  return { costToDate, perDiemTotal, weeksEntered, totalWeeks, crewCount, bandCount, projectedTotal };
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Users/bq/Lowpass Local/lowpass-app-1" && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/tour-overview/overview-utils.ts
git commit -m "feat(tour-overview): add aggregation utilities and TypeScript types"
```

---

## Task 3: Server Page — Data Loading

**Files:**
- Create: `src/app/(app)/tours/[id]/overview/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
/* ============================================
   LOWPASS — Tour Overview Page

   Per-tour summary dashboard.
   Server: fetches all section data; client: renders the 3+2 card grid.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourOverviewClient } from '@/components/tour-overview/TourOverviewClient';
import {
  computeBudgetData,
  computeAdvanceData,
  computeSettlementData,
  computeRoomingData,
  computePayrollData,
  type TourHeroData,
} from '@/components/tour-overview/overview-utils';

export default async function TourOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  // 1. Tour + artist
  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('*, artist:artists(*)')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  // 2. Routing — needed before routing_id-keyed queries
  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date, venue_name, day_type')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  const routing = routingRows ?? [];
  const routingIds = routing.map((r) => r.id);

  // 3–9. Parallel queries for section data
  const [
    { data: budgetIncome },
    { data: budgetLineItems },
    { data: advanceInstances },
    { data: settlements },
    { data: hotelBookings },
    { data: personnelRates },
    { data: payrollEntries },
  ] = await Promise.all([
    routingIds.length > 0
      ? supabase.from('budget_income').select('post_tax_guarantee, post_tax_overage, merch_income, vip_income, actual_guarantee, actual_overage, actual_merch, actual_vip').in('routing_id', routingIds)
      : Promise.resolve({ data: [] }),
    supabase.from('budget_line_items').select('proposed_cost, actual_cost').eq('tour_id', tourId),
    routingIds.length > 0
      ? supabase.from('advance_instances').select('routing_id, status, flags').in('routing_id', routingIds)
      : Promise.resolve({ data: [] }),
    routingIds.length > 0
      ? supabase.from('settlements').select('routing_id, status, reconciled_guarantee, reconciled_overage').in('routing_id', routingIds)
      : Promise.resolve({ data: [] }),
    supabase.from('hotel_bookings').select('hotel_name, check_in_date, check_out_date, city, hotel_room_assignments(id)').eq('tour_id', tourId).eq('workspace_id', tour.workspace_id).order('check_in_date', { ascending: true, nullsFirst: true }),
    supabase.from('personnel_rates').select('person_type, show_rate, off_rate, per_diem').eq('tour_id', tourId),
    supabase.from('payroll_entries').select('week_start, total_fee, total_per_diem').eq('tour_id', tourId),
  ]);

  // Hero data
  const today = new Date();
  const start = tour.start_date ? new Date(`${tour.start_date}T12:00:00`) : null;
  const end = tour.end_date ? new Date(`${tour.end_date}T12:00:00`) : null;
  const daysUntilStart =
    start && start.getTime() > today.getTime()
      ? Math.ceil((start.getTime() - today.getTime()) / 86400000)
      : null;
  const daysRemaining =
    end && end.getTime() > today.getTime()
      ? Math.ceil((end.getTime() - today.getTime()) / 86400000)
      : null;
  const inProgress = !!(start && end && today >= start && today <= end);
  const showCount = routing.filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;

  const heroData: TourHeroData = { showCount, daysUntilStart, daysRemaining, inProgress };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
      <TourOverviewClient
        tour={tour}
        heroData={heroData}
        budgetData={computeBudgetData(budgetIncome ?? [], budgetLineItems ?? [])}
        advanceData={computeAdvanceData(advanceInstances ?? [], routing)}
        settlementData={computeSettlementData(settlements ?? [], routing, today)}
        roomingData={computeRoomingData(hotelBookings ?? [], routing, personnelRates ?? [], today)}
        payrollData={computePayrollData(payrollEntries ?? [], personnelRates ?? [], routing)}
      />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Users/bq/Lowpass Local/lowpass-app-1" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/tours/[id]/overview/page.tsx"
git commit -m "feat(tour-overview): add server page with data loading"
```

---

## Task 4: Tour Hero Bar

**Files:**
- Create: `src/components/tour-overview/TourHeroBar.tsx`

Uses `formatTourDateRange` from `src/lib/utils.ts` and the `statusColors` pattern from `src/app/(app)/tours/[id]/page.tsx` lines 16–21.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { cn, formatTourDateRange } from '@/lib/utils';
import type { TourHeroData } from './overview-utils';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-gray-500/10 text-gray-400',
};

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Tour {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  artist?: { name?: string | null; spotify_image_url?: string | null } | null;
}

interface Props {
  tour: Tour;
  heroData: TourHeroData;
}

export function TourHeroBar({ tour, heroData }: Props) {
  const { showCount, daysUntilStart, daysRemaining, inProgress } = heroData;
  const artist = tour.artist;

  const daysLabel = inProgress
    ? `${daysRemaining ?? '—'}d remaining`
    : daysUntilStart != null
    ? `Starts in ${daysUntilStart}d`
    : '—';

  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Artist + Tour */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-lp-border bg-lp-bg">
            {artist?.spotify_image_url ? (
              <img src={artist.spotify_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-lp-text-tertiary">
                {(artist?.name ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-lp-text-tertiary">{artist?.name ?? '—'}</p>
            <h1 className="text-lg font-bold text-lp-text">{tour.name}</h1>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="text-lp-text-secondary">
            {formatTourDateRange(tour.start_date, tour.end_date)}
          </div>
          <div>
            <span className="text-lp-text-tertiary mr-1">Shows</span>
            <span className="font-semibold text-lp-text">{showCount}</span>
          </div>
          <div>
            <span className="text-lp-text-secondary">{daysLabel}</span>
          </div>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              statusColors[tour.status] ?? statusColors.planning
            )}
          >
            {capitalise(tour.status)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Users/bq/Lowpass Local/lowpass-app-1" && npx tsc --noEmit 2>&1 | head -20
```

---

## Task 5: Budget Summary Card

**Files:**
- Create: `src/components/tour-overview/BudgetSummaryCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link';
import { LayoutPanelLeft, ArrowRight } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { BudgetCardData } from './overview-utils';

// Use formatCurrency from @/lib/utils — takes a currency CODE ('GBP', 'USD'), not a symbol.
// formatCurrency already maps codes to symbols (GBP→£, USD→$, EUR→€, AUD→A$).

function variancePct(actual: number, proposed: number) {
  if (proposed === 0) return null;
  return Math.round(((actual - proposed) / Math.abs(proposed)) * 100);
}

interface Props {
  data: BudgetCardData | null;
  tourId: string;
  currency?: string; // currency CODE e.g. 'GBP', 'USD' — passed to formatCurrency()
}

export function BudgetSummaryCard({ data, tourId, currency = 'GBP' }: Props) {
  const href = `/budget?tour_id=${tourId}&tab=summary`;

  if (!data) {
    return (
      <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
        <CardHeader href={href} />
        <p className="mt-4 text-sm text-lp-text-tertiary">No budget data yet.</p>
        <Link href={href} className="mt-2 text-xs text-lp-orange hover:underline">Open Budget →</Link>
      </div>
    );
  }

  const netActual = data.actualIncome - data.actualExpenses;
  const netProposed = data.proposedIncome - data.proposedExpenses;
  const pct = variancePct(netActual, netProposed);
  const spendPct = data.proposedExpenses > 0
    ? Math.min(Math.round((data.actualExpenses / data.proposedExpenses) * 100), 100)
    : 0;
  const overBudget = data.actualExpenses > data.proposedExpenses * 1.1;

  return (
    <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
      <CardHeader href={href} />

      {/* Primary stat */}
      <div className="mt-3">
        <p className={cn('text-3xl font-bold tabular-nums', netActual >= 0 ? 'text-emerald-500' : 'text-red-500')}>
          {netActual < 0 && '−'}{formatCurrency(Math.abs(netActual), currency)}
        </p>
        {pct !== null && (
          <p className={cn('text-xs mt-1', pct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
            {pct >= 0 ? '+' : ''}{pct}% vs proposed
          </p>
        )}
      </div>

      {/* Supporting rows */}
      <div className="mt-4 space-y-2 text-sm">
        <Row label="Gross Income"
          proposed={formatCurrency(data.proposedIncome, currency)}
          actual={data.actualIncome > 0 ? formatCurrency(data.actualIncome, currency) : '—'} />
        <Row label="Total Expenses"
          proposed={formatCurrency(data.proposedExpenses, currency)}
          actual={data.actualExpenses > 0 ? formatCurrency(data.actualExpenses, currency) : '—'} />
        <Row label="Net Profit"
          proposed={formatCurrency(netProposed, currency)}
          actual={data.actualIncome > 0 || data.actualExpenses > 0 ? formatCurrency(netActual, currency) : '—'} />
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <p className="text-xs text-lp-text-tertiary mb-1">Budget used {spendPct}%</p>
        <div className="h-1.5 w-full rounded-full bg-lp-border">
          <div
            className={cn('h-full rounded-full transition-all', overBudget ? 'bg-red-500' : 'bg-lp-orange')}
            style={{ width: `${spendPct}%` }}
          />
        </div>
      </div>

      {/* Alert strip */}
      {overBudget && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-500">
          Expenses exceed budget by more than 10%
        </p>
      )}
    </div>
  );
}

function CardHeader({ href }: { href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <LayoutPanelLeft size={16} className="text-lp-text-tertiary" />
        <span className="text-sm font-semibold text-lp-text">Budget</span>
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-lp-text-tertiary hover:text-lp-orange">
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function Row({ label, proposed, actual }: { label: string; proposed: string; actual: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-lp-text-tertiary">{label}</span>
      <span className="text-lp-text-secondary tabular-nums">
        <span className="text-lp-text-tertiary">{proposed}</span>
        <span className="mx-1 text-lp-text-tertiary/50">→</span>
        {actual}
      </span>
    </div>
  );
}
```

---

## Task 6: Advance Summary Card

**Files:**
- Create: `src/components/tour-overview/AdvanceSummaryCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdvanceCardData } from './overview-utils';

interface Props {
  data: AdvanceCardData | null;
  tourId: string;
}

export function AdvanceSummaryCard({ data, tourId }: Props) {
  const href = `/tours/${tourId}/advance`;

  if (!data) {
    return (
      <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
        <CardHeader href={href} />
        <p className="mt-4 text-sm text-lp-text-tertiary">No advances started.</p>
        <Link href={href} className="mt-2 text-xs text-lp-orange hover:underline">Open Advances →</Link>
      </div>
    );
  }

  const pct = data.total > 0 ? Math.round((data.complete / data.total) * 100) : 0;

  return (
    <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
      <CardHeader href={href} />

      {/* Primary stat */}
      <div className="mt-3">
        <p className="text-3xl font-bold tabular-nums text-lp-text">
          {data.complete} <span className="text-lg font-normal text-lp-text-tertiary">/ {data.total}</span>
        </p>
        <p className="mt-0.5 text-xs text-lp-text-tertiary">shows advanced</p>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full rounded-full bg-lp-border">
          <div className="h-full rounded-full bg-lp-orange transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Status pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Pill label="Not Started" count={data.notStarted} color="bg-lp-surface text-lp-text-secondary" />
        <Pill label="In Progress" count={data.inProgress} color="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
        <Pill label="Complete" count={data.complete} color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
        <Pill label="Needs Review" count={data.needsReview} color="bg-red-500/10 text-red-500" />
      </div>

      {/* Flags + next show */}
      {(data.criticalFlags > 0 || data.highFlags > 0) && (
        <p className="mt-3 text-xs text-lp-text-secondary">
          <span className="text-red-500">{data.criticalFlags} critical</span>
          {data.highFlags > 0 && <> · <span className="text-amber-500">{data.highFlags} high priority</span> flags</>}
        </p>
      )}
      {data.nextShow && (
        <p className="mt-2 text-xs text-lp-text-secondary">
          <span className="text-lp-text-tertiary">Next up:</span> {data.nextShow.venueName}
          <span className="ml-1 text-lp-text-tertiary">({data.nextShow.date})</span>
        </p>
      )}

      {/* Alert strip */}
      {data.criticalFlags > 0 && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-500">
          {data.criticalFlags} critical flag{data.criticalFlags !== 1 ? 's' : ''} need attention
        </p>
      )}
    </div>
  );
}

function CardHeader({ href }: { href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <ClipboardList size={16} className="text-lp-text-tertiary" />
        <span className="text-sm font-semibold text-lp-text">Advance</span>
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-lp-text-tertiary hover:text-lp-orange">
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', color)}>
      {count} {label}
    </span>
  );
}
```

---

## Task 7: Settlement Summary Card

**Files:**
- Create: `src/components/tour-overview/SettlementSummaryCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import Link from 'next/link';
import { Scale, ArrowRight } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { SettlementCardData } from './overview-utils';

const statusChip: Record<string, string> = {
  reconciled: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  day_of_complete: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  pending: 'bg-lp-surface text-lp-text-tertiary',
};

const statusLabel: Record<string, string> = {
  reconciled: 'Reconciled',
  day_of_complete: 'Day-of Complete',
  pending: 'Pending',
};

interface Props {
  data: SettlementCardData | null;
  tourId: string;
  currency?: string; // currency CODE e.g. 'GBP'
}

export function SettlementSummaryCard({ data, tourId, currency = 'GBP' }: Props) {
  const href = `/budget?tour_id=${tourId}&tab=settlement`;

  if (!data) {
    return (
      <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
        <CardHeader href={href} />
        <p className="mt-4 text-sm text-lp-text-tertiary">No settlements yet.</p>
        <Link href={href} className="mt-2 text-xs text-lp-orange hover:underline">Open Settlement →</Link>
      </div>
    );
  }

  return (
    <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
      <CardHeader href={href} />

      {/* Primary stat */}
      <div className="mt-3">
        <p className="text-3xl font-bold tabular-nums text-lp-text">{formatCurrency(data.reconciledRevenue, currency)}</p>
        <p className="mt-0.5 text-xs text-lp-text-tertiary">total reconciled revenue</p>
      </div>

      {/* Status rows */}
      <div className="mt-4 space-y-1.5 text-sm">
        <StatusRow label="Reconciled" count={data.reconciled} />
        <StatusRow label="Day-of Complete" count={data.dayOfComplete} />
        <StatusRow label="Pending" count={data.pending} />
      </div>

      {/* Scrollable recent shows */}
      {data.recentShows.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">Recent shows</p>
          <div className="max-h-[90px] overflow-y-auto space-y-1 pr-1">
            {data.recentShows.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-lp-text-secondary truncate mr-2">{s.date} · {s.venueName}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0', statusChip[s.status] ?? statusChip.pending)}>
                  {statusLabel[s.status] ?? 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alert strip */}
      {data.missingCount > 0 && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          {data.missingCount} past show{data.missingCount !== 1 ? 's' : ''} missing settlement
        </p>
      )}
    </div>
  );
}

function CardHeader({ href }: { href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-lp-text-tertiary" />
        <span className="text-sm font-semibold text-lp-text">Settlement</span>
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-lp-text-tertiary hover:text-lp-orange">
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function StatusRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-lp-text-tertiary">{label}</span>
      <span className="tabular-nums text-lp-text">{count} shows</span>
    </div>
  );
}
```

---

## Task 8: Rooming Summary Card

**Files:**
- Create: `src/components/tour-overview/RoomingSummaryCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link';
import { Hotel, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoomingCardData } from './overview-utils';

interface Props {
  data: RoomingCardData | null;
  tourId: string;
}

export function RoomingSummaryCard({ data, tourId }: Props) {
  const href = `/tours/${tourId}/rooming`;

  if (!data) {
    return (
      <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
        <CardHeader href={href} />
        <p className="mt-4 text-sm text-lp-text-tertiary">No hotels added yet.</p>
        <Link href={href} className="mt-2 text-xs text-lp-orange hover:underline">Open Rooming →</Link>
      </div>
    );
  }

  const pct = data.totalNights > 0
    ? Math.round((data.nightsCovered / data.totalNights) * 100)
    : 0;

  return (
    <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
      <CardHeader href={href} />

      {/* Primary stat */}
      <div className="mt-3">
        <p className="text-3xl font-bold tabular-nums text-lp-text">
          {data.nightsCovered} <span className="text-lg font-normal text-lp-text-tertiary">/ {data.totalNights}</span>
        </p>
        <p className="mt-0.5 text-xs text-lp-text-tertiary">nights with hotel booked</p>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full rounded-full bg-lp-border">
          <div
            className={cn('h-full rounded-full transition-all', data.gapCount > 0 ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Supporting rows */}
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-lp-text-tertiary">Rooms assigned</span>
          <span className="tabular-nums text-lp-text">{data.assignedCount}</span>
        </div>
        {data.nextCheckIn && (
          <div className="flex items-center justify-between">
            <span className="text-lp-text-tertiary">Next check-in</span>
            <span className="text-lp-text-secondary text-right max-w-[55%] truncate">
              {data.nextCheckIn.hotelName} · {data.nextCheckIn.date}
            </span>
          </div>
        )}
      </div>

      {/* Alert strip */}
      {data.gapCount > 0 && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          {data.gapCount} show night{data.gapCount !== 1 ? 's' : ''} without a hotel booking
        </p>
      )}
    </div>
  );
}

function CardHeader({ href }: { href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Hotel size={16} className="text-lp-text-tertiary" />
        <span className="text-sm font-semibold text-lp-text">Rooming</span>
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-lp-text-tertiary hover:text-lp-orange">
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}
```

---

## Task 9: Payroll Summary Card

**Files:**
- Create: `src/components/tour-overview/PayrollSummaryCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link';
import { DollarSign, ArrowRight } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { PayrollCardData } from './overview-utils';

interface Props {
  data: PayrollCardData | null;
  tourId: string;
  currency?: string; // currency CODE e.g. 'GBP'
}

export function PayrollSummaryCard({ data, tourId, currency = 'GBP' }: Props) {
  const href = `/tours/${tourId}/payroll`;

  if (!data) {
    return (
      <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
        <CardHeader href={href} />
        <p className="mt-4 text-sm text-lp-text-tertiary">No payroll data yet.</p>
        <Link href={href} className="mt-2 text-xs text-lp-orange hover:underline">Open Payroll →</Link>
      </div>
    );
  }

  const weeksPct = data.totalWeeks > 0
    ? Math.min(Math.round((data.weeksEntered / data.totalWeeks) * 100), 100)
    : 0;
  const weeksBehind = data.weeksEntered < data.totalWeeks;

  return (
    <div className="lp-dashboard-glass-card rounded-xl border border-lp-border p-5">
      <CardHeader href={href} />

      {/* Primary stat */}
      <div className="mt-3">
        <p className="text-3xl font-bold tabular-nums text-lp-text">{formatCurrency(data.costToDate, currency)}</p>
        <p className="mt-0.5 text-xs text-lp-text-tertiary">payroll cost to date</p>
      </div>

      {/* Supporting rows */}
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-lp-text-tertiary">Personnel</span>
          <span className="text-lp-text-secondary">{data.crewCount} crew · {data.bandCount} band</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lp-text-tertiary">Projected total</span>
          <span className="tabular-nums text-lp-text">{formatCurrency(data.projectedTotal, currency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lp-text-tertiary">Per diem total</span>
          <span className="tabular-nums text-lp-text-secondary">{formatCurrency(data.perDiemTotal, currency)}</span>
        </div>
      </div>

      {/* Weeks progress bar */}
      <div className="mt-4">
        <p className="text-xs text-lp-text-tertiary mb-1">
          Weeks entered {data.weeksEntered} / {data.totalWeeks}
        </p>
        <div className="h-1.5 w-full rounded-full bg-lp-border">
          <div
            className={cn('h-full rounded-full transition-all', weeksBehind ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${weeksPct}%` }}
          />
        </div>
      </div>

      {/* Alert strip */}
      {weeksBehind && data.weeksEntered > 0 && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          {data.totalWeeks - data.weeksEntered} week{(data.totalWeeks - data.weeksEntered) !== 1 ? 's' : ''} not yet entered
        </p>
      )}
    </div>
  );
}

function CardHeader({ href }: { href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <DollarSign size={16} className="text-lp-text-tertiary" />
        <span className="text-sm font-semibold text-lp-text">Payroll</span>
      </div>
      <Link href={href} className="flex items-center gap-1 text-xs text-lp-text-tertiary hover:text-lp-orange">
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}
```

---

## Task 10: TourOverviewClient — Assemble the Page

**Files:**
- Create: `src/components/tour-overview/TourOverviewClient.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { TourHeroBar } from './TourHeroBar';
import { BudgetSummaryCard } from './BudgetSummaryCard';
import { AdvanceSummaryCard } from './AdvanceSummaryCard';
import { SettlementSummaryCard } from './SettlementSummaryCard';
import { RoomingSummaryCard } from './RoomingSummaryCard';
import { PayrollSummaryCard } from './PayrollSummaryCard';
import type {
  TourHeroData,
  BudgetCardData,
  AdvanceCardData,
  SettlementCardData,
  RoomingCardData,
  PayrollCardData,
} from './overview-utils';

interface Tour {
  id: string;
  name: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  currency?: string | null;
  workspace_id?: string;
  artist?: { name?: string | null; spotify_image_url?: string | null } | null;
}

interface Props {
  tour: Tour;
  heroData: TourHeroData;
  budgetData: BudgetCardData | null;
  advanceData: AdvanceCardData | null;
  settlementData: SettlementCardData | null;
  roomingData: RoomingCardData | null;
  payrollData: PayrollCardData | null;
}

export function TourOverviewClient({
  tour,
  heroData,
  budgetData,
  advanceData,
  settlementData,
  roomingData,
  payrollData,
}: Props) {
  const currency = tour.currency ?? 'GBP'; // Pass currency CODE to formatCurrency(), not a symbol

  return (
    <div className="lp-dashboard-glass space-y-4">
      {/* Hero bar */}
      <TourHeroBar tour={tour} heroData={heroData} />

      {/* Top row: 3 equal columns */}
      <div className="grid gap-4 md:grid-cols-3">
        <BudgetSummaryCard data={budgetData} tourId={tour.id} currency={currency} />
        <AdvanceSummaryCard data={advanceData} tourId={tour.id} />
        <SettlementSummaryCard data={settlementData} tourId={tour.id} currency={currency} />
      </div>

      {/* Bottom row: 2 equal columns */}
      <div className="grid gap-4 md:grid-cols-2">
        <RoomingSummaryCard data={roomingData} tourId={tour.id} />
        <PayrollSummaryCard data={payrollData} tourId={tour.id} currency={currency} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Final TypeScript check**

```bash
cd "/Users/bq/Lowpass Local/lowpass-app-1" && npx tsc --noEmit 2>&1
```
Expected: no errors

- [ ] **Step 3: Run the dev server and verify**

```bash
cd "/Users/bq/Lowpass Local/lowpass-app-1" && npm run dev
```

Then open `http://localhost:3000` and check:
1. Sidebar shows "MANAGE TOUR" as the section header
2. "Tour Summary" is the first item below the artist/tour selector
3. Select an artist + tour in the sidebar, click Tour Summary
4. Page loads at `/tours/{id}/overview` with hero bar + 5 cards
5. All "View →" links navigate correctly
6. Navigate to `/tours/invalid-uuid/overview` — confirms 404 page
7. Budget card numbers match Budget → Summary tab values
8. Advance progress count matches Advance overview page
9. Dark mode renders correctly

- [ ] **Step 4: Final commit**

```bash
git add src/components/tour-overview/
git commit -m "feat(tour-overview): add Tour Summary page with 5-section dashboard"
```

