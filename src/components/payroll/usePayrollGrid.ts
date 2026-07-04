'use client';

/* ============================================
   LOWPASS — usePayrollGrid (shared payroll day-status data layer)

   Backs the Days matrix (and feeds the Rates & totals computed columns) with
   ONE copy of the day-status read/write. Write path UNCHANGED — same
   POST /api/budget/payroll (per person per week, merging day_statuses) the week
   sheet used — so the budget Salary/Per-Diem reconcile feed stays identical.
   Optimistic per-cell override (OPS-04 feel), revert on failure.
   ============================================ */

import { useCallback, useMemo, useState } from 'react';
import { getWeekStart } from './payroll-utils';
import { useToast } from '@/components/ui/Toast';

export const DAY_OPTIONS = [
  { value: 'show', label: 'SHOW DAY' },
  { value: 'off_travel', label: 'OFF/TRAVEL DAY' },
  { value: 'no_tour', label: 'NO TOUR' },
];

/** routing.day_type → payroll day status (matches the week sheet + generate). */
export function dayTypeToStatus(dayType: string | undefined): string {
  const t = (dayType ?? '').toLowerCase();
  if (t === 'show' || t === 'festival') return 'show';
  if (['off', 'travel', 'press', 'radio', 'tv', 'rehearsal'].includes(t)) return 'off_travel';
  return 'no_tour';
}

/** Token tint for a day status (replaces the hardcoded Tailwind emerald/amber). */
export function dayStatusTint(status: string): string | undefined {
  if (status === 'show') return 'color-mix(in srgb, var(--color-lp-day-show) 18%, transparent)';
  if (status === 'off_travel') return 'color-mix(in srgb, var(--color-lp-warning) 18%, transparent)';
  return undefined; // no_tour → no tint
}

export interface PayrollPerson {
  id: string;
  person_name: string;
  role: string;
  /* Rates SSOT — per-week fees are computed from personnel_rate_lines via the
   *  client amountMap (personTotals), NOT from per-card rate columns. */
  per_diem: number;
  advance_fee: number;
}
export interface RoutingDay {
  id: string;
  date: string;
  day_type?: string;
  venue_name?: string;
  city?: string;
}

type Entry = Record<string, unknown>;

export function usePayrollGrid(
  tourId: string,
  routingDates: RoutingDay[],
  payrollEntries: Entry[],
) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<Entry[]>(payrollEntries);
  // optimistic per-cell overrides keyed `${personnelId}:${date}`.
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  const routingByDate = useMemo(() => {
    const m = new Map<string, RoutingDay>();
    for (const r of routingDates) {
      const d = (r.date ?? '').slice(0, 10);
      if (d) m.set(d, r);
    }
    return m;
  }, [routingDates]);

  // (personnelId, weekStart) → entry (for merge-on-save).
  const entryByPersonWeek = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.personnel_id}:${e.week_start}`, e);
    return m;
  }, [entries]);

  /** Persisted status for a (person, date), else the routing-derived default. */
  const statusOf = useCallback(
    (personnelId: string, date: string): string => {
      const ov = overrides.get(`${personnelId}:${date}`);
      if (ov) return ov;
      const entry = entryByPersonWeek.get(`${personnelId}:${getWeekStart(date)}`);
      const persisted = (entry?.day_statuses as Record<string, string> | undefined)?.[date];
      if (persisted) return persisted;
      return dayTypeToStatus(routingByDate.get(date)?.day_type);
    },
    [overrides, entryByPersonWeek, routingByDate],
  );

  const saveDayStatus = useCallback(
    async (personnelId: string, date: string, status: string) => {
      const key = `${personnelId}:${date}`;
      const prev = statusOf(personnelId, date);
      if (prev === status) return;
      setOverrides((o) => new Map(o).set(key, status));
      const weekStart = getWeekStart(date);
      const entry = entryByPersonWeek.get(`${personnelId}:${weekStart}`);
      const statuses = { ...((entry?.day_statuses as Record<string, string>) ?? {}), [date]: status };
      try {
        const res = await fetch('/api/budget/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, personnel_id: personnelId, week_start: weekStart, day_statuses: statuses }),
        });
        if (!res.ok) throw new Error('Save failed');
        const updated = await res.json();
        setEntries((p) => [...p.filter((e) => !(e.personnel_id === personnelId && e.week_start === weekStart)), updated]);
      } catch {
        setOverrides((o) => new Map(o).set(key, prev));
        showToast('Could not save day status', 'error');
      }
    },
    [tourId, statusOf, entryByPersonWeek, showToast],
  );

  return { statusOf, saveDayStatus, entries };
}
