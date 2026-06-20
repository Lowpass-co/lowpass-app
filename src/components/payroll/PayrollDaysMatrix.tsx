'use client';

/* ============================================
   LOWPASS — <PayrollDaysMatrix> (rebuilt ON the canonical <Grid>, wide mode)

   people = rows (frozen person column), routing dates = day dropdown columns
   (DAY_OPTIONS show/off_travel/no_tour, optColors → cell-fill tint). All
   routing dates incl. no-tour. Week treatment: the week label + a divider on
   each Monday's day-header (D1 light option — no column-group machinery).
   Writes go through usePayrollGrid (saveDayStatus) → the budget Salary feed is
   UNCHANGED (view layer only).
   ============================================ */

import { useMemo } from 'react';
import { Grid } from '@/components/grid/Grid';
import type { Column, Row, Section } from '@/components/grid/types';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { getWeekStart, formatWeekLabel } from '@/lib/routing/week';
import { DAY_OPTIONS, type RoutingDay, type PayrollPerson } from './usePayrollGrid';

const DAY_CODES = DAY_OPTIONS.map((o) => o.value);
const DAY_OPTCOLORS: Record<string, string> = {
  show: 'var(--color-lp-day-show)',
  off_travel: 'var(--color-lp-warning)',
};
const DAY_OPTLABELS: Record<string, string> = { show: 'Show', off_travel: 'Off / Travel', no_tour: '—' };

/** Build the full rate-bearing person from a personnel_rates row (for totalsFor
 *  + the frozen Total column). */
function toPerson(pr: Record<string, unknown>): PayrollPerson {
  return {
    id: pr.id as string,
    person_name: (pr.person_name as string) ?? '',
    role: (pr.role as string) ?? '',
    show_rate: Number(pr.show_rate) || 0,
    off_rate: Number(pr.off_rate) || 0,
    rehearsal_rate: Number(pr.rehearsal_rate) || 0,
    per_diem: Number(pr.per_diem) || 0,
    advance_fee: Number(pr.advance_fee) || 0,
  };
}

function DayHeader({ day, weekStart }: { day: RoutingDay; weekStart: boolean }) {
  const dt = (day.day_type ?? '').trim();
  const d = day.date ? day.date.slice(5) : '';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        lineHeight: 1.15,
        padding: '2px 0',
        borderLeft: weekStart ? '2px solid var(--lp-orange)' : undefined,
        marginLeft: weekStart ? -1 : undefined,
      }}
    >
      {weekStart ? (
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--lp-orange)' }}>
          {formatWeekLabel(getWeekStart(day.date))}
        </span>
      ) : null}
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--lp-text)' }}>{d}</span>
      {day.city ? <span style={{ fontSize: 9, color: 'var(--lp-text-tertiary)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{day.city}</span> : null}
      {dt ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 600, color: colourForDayType(dt) }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: colourForDayType(dt) }} />
          {labelForDayType(dt) || dt}
        </span>
      ) : null}
    </div>
  );
}

/** Per-person fee totals (only `totalFee` is consumed here). */
type PersonTotals = { totalFee: number };

export function PayrollDaysMatrix({
  routingDates,
  personnelRates,
  currency,
  statusOf,
  saveDayStatus,
  totalsFor,
}: {
  routingDates: RoutingDay[];
  personnelRates: Record<string, unknown>[];
  currency: string;
  /** Lifted from PayrollView's shared usePayrollGrid (PAY-01). */
  statusOf: (personnelId: string, date: string) => string;
  saveDayStatus: (personnelId: string, date: string, status: string) => void | Promise<void>;
  totalsFor: (p: PayrollPerson) => PersonTotals;
}) {
  const people = useMemo(() => personnelRates.map(toPerson), [personnelRates]);
  const money = useMemo(
    () =>
      new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: (currency || 'GBP').trim().toUpperCase(),
        maximumFractionDigits: 0,
      }),
    [currency],
  );

  // Sort dates; mark each week-start (first date of its Monday week).
  const days = useMemo(() => [...routingDates].filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date)), [routingDates]);
  const weekStartIds = useMemo(() => {
    const set = new Set<string>();
    let prevWeek: string | null = null;
    for (const d of days) {
      const w = getWeekStart(d.date);
      if (w !== prevWeek) {
        set.add(d.date);
        prevWeek = w;
      }
    }
    return set;
  }, [days]);
  const dayByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const columns: Column[] = useMemo(
    () => [
      // MTX-06 — person + a frozen Total column (frozenCols=2). Fixed widths so
      // the second frozen column's sticky-left offset is deterministic.
      { id: 'person', label: 'Person', type: 'text', ro: true, w: 180, min: 180, resize: false },
      { id: '__total', label: 'Total', type: 'text', ro: true, w: 104, min: 104, resize: false },
      ...days.map<Column>((d) => ({ id: d.date, label: d.date.slice(5), type: 'dropdown', options: DAY_CODES, optColors: DAY_OPTCOLORS, optLabels: DAY_OPTLABELS, w: 92, min: 76, resize: true })),
    ],
    [days],
  );

  const data: Section[] = useMemo(() => {
    const rows: Row[] = people.map((p) => {
      const row: Row = { _uid: p.id, person: p.person_name, __total: money.format(totalsFor(p).totalFee) };
      for (const d of days) row[d.date] = statusOf(p.id, d.date);
      return row;
    });
    return [{ name: 'Personnel', kind: 'normal', _uid: 'payroll', rows }];
  }, [people, days, statusOf, totalsFor, money]);

  if (people.length === 0) {
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>No personnel on this tour yet.</div>;
  }

  return (
    <Grid
      key={`payroll-days:${people.length}:${days.length}`}
      initialColumns={columns}
      initialData={data}
      wide
      frozenCols={2}
      allowAddRows={false}
      onEdit={(personId, colId, value) => {
        if (colId === 'person' || colId === '__total') return;
        saveDayStatus(String(personId), colId, String(value));
      }}
      headerFor={(colId) => {
        if (colId === 'person') return 'Person';
        if (colId === '__total') return 'Total';
        const d = dayByDate.get(colId);
        return d ? <DayHeader day={d} weekStart={weekStartIds.has(colId)} /> : colId;
      }}
    />
  );
}
