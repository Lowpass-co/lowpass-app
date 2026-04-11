// src/components/tour-overview/overview-utils.ts
// Pure aggregation for Tour Summary — no I/O.

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
  nextCheckIn: { hotelName: string; date: string; city?: string | null } | null;
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
    (sum, r) =>
      sum + n(r.post_tax_guarantee) + n(r.post_tax_overage) + n(r.merch_income) + n(r.vip_income),
    0
  );
  const actualIncome = income.reduce(
    (sum, r) =>
      sum + n(r.actual_guarantee) + n(r.actual_overage) + n(r.actual_merch) + n(r.actual_vip),
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
  const allFlags = instances.flatMap((i) => (Array.isArray(i.flags) ? i.flags : []));
  const criticalFlags = allFlags.filter((f) => f.severity === 'critical').length;
  const highFlags = allFlags.filter((f) => f.severity === 'high').length;

  const instanceMap = new Map(instances.map((i) => [i.routing_id, i]));
  const nextShow =
    routing
      .filter((r) => r.day_type === 'show' || r.day_type === 'festival')
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
  const todayStr = today.toISOString().slice(0, 10);
  const pastRouting = routing.filter(
    (r) =>
      (r.day_type === 'show' || r.day_type === 'festival') &&
      r.date < todayStr
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
    return !s || s.status === 'pending' || !s.status;
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

/** Nights that typically need hotel coverage (show, festival, travel). */
function isRoomingNight(dayType: string | null | undefined): boolean {
  return dayType === 'show' || dayType === 'festival' || dayType === 'travel';
}

export function computeRoomingData(
  hotels: RawHotelBooking[],
  routing: RawRouting[],
  _personnelRates: { person_type?: string | null }[],
  today: Date
): RoomingCardData | null {
  if (hotels.length === 0 && routing.length === 0) return null;

  const todayStr = today.toISOString().slice(0, 10);
  const showNights = routing.filter((r) => isRoomingNight(r.day_type ?? undefined));
  const totalNights = showNights.length;

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
      .filter((h) => h.check_in_date && h.check_in_date >= todayStr)
      .sort((a, b) => (a.check_in_date ?? '').localeCompare(b.check_in_date ?? ''))
      .map((h) => ({
        hotelName: h.hotel_name,
        date: h.check_in_date!,
        city: h.city,
      }))[0] ?? null;

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

  let totalWeeks = 0;
  if (routing.length > 0) {
    const sorted = [...routing].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = new Date(sorted[0].date + 'T12:00:00');
    const lastDate = new Date(sorted[sorted.length - 1].date + 'T12:00:00');
    const days = Math.ceil((lastDate.getTime() - firstDate.getTime()) / 86400000);
    totalWeeks = Math.max(1, Math.ceil(days / 7) + 1);
  }

  const crewCount = rates.filter((r) => r.person_type === 'crew').length;
  const bandCount = rates.filter(
    (r) => r.person_type === 'band' || r.person_type === 'principal'
  ).length;

  const avgWeeklyCost = rates.reduce(
    (sum, r) => sum + (n(r.show_rate) + n(r.off_rate)) / 2 + n(r.per_diem) * 7,
    0
  );
  const projectedTotal = avgWeeklyCost * Math.max(totalWeeks, 1);

  return { costToDate, perDiemTotal, weeksEntered, totalWeeks, crewCount, bandCount, projectedTotal };
}
