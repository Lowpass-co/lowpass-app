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
import type { Column, GridFx, Row, Section } from '@/components/grid/types';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { getWeekStart, formatWeekLabel } from '@/lib/routing/week';
import { countDayStatuses } from '@/lib/payroll/fees';
import type { RateTypeMeta } from '@/lib/payroll/rateLines';
import { personTotals, type LineAmountMap } from './rateLinesClient';
import { DAY_OPTIONS, type RoutingDay, type PayrollPerson } from './usePayrollGrid';

const DAY_CODES = DAY_OPTIONS.map((o) => o.value);
const DAY_OPTCOLORS: Record<string, string> = {
  show: 'var(--color-lp-day-show)',
  off_travel: 'var(--color-lp-warning)',
};
const DAY_OPTLABELS: Record<string, string> = { show: 'Show', off_travel: 'Off / Travel', no_tour: '—' };

/** Build the person row from a personnel_rates row. Rate values are NOT read
 *  from the card columns — the frozen Total column computes from the SSOT
 *  amountMap (personTotals) — so only identity + non-gated fields are copied. */
function toPerson(pr: Record<string, unknown>): PayrollPerson {
  return {
    id: pr.id as string,
    person_name: (pr.person_name as string) ?? '',
    role: (pr.role as string) ?? '',
    per_diem: Number(pr.per_diem) || 0,
    advance_fee: Number(pr.advance_fee) || 0,
  };
}

function DayHeader({ day, weekStart }: { day: RoutingDay; weekStart: boolean }) {
  const dt = (day.day_type ?? '').trim();
  const d = day.date ? day.date.slice(5) : '';
  return (
    /* MTX-05 — the week label / date / city / day-type used to collide in the
       narrow column (no whiteSpace:nowrap → city + type wrapped). Full-width
       children + nowrap + ellipsis truncate cleanly; a bit more gap/padding
       gives each row breathing room. */
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        lineHeight: 1.2,
        padding: '4px 4px 3px',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        borderLeft: weekStart ? '2px solid var(--lp-orange)' : undefined,
        marginLeft: weekStart ? -1 : undefined,
      }}
    >
      {weekStart ? (
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: 'var(--lp-orange)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formatWeekLabel(getWeekStart(day.date))}
        </span>
      ) : null}
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>{d}</span>
      {day.city ? (
        <span
          title={day.city}
          style={{
            fontSize: 9,
            color: 'var(--lp-text-tertiary)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {day.city}
        </span>
      ) : null}
      {dt ? (
        <span
          title={labelForDayType(dt) || dt}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            maxWidth: '100%',
            fontSize: 8,
            fontWeight: 600,
            color: colourForDayType(dt),
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: colourForDayType(dt), flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelForDayType(dt) || dt}</span>
        </span>
      ) : null}
    </div>
  );
}

export function PayrollDaysMatrix({
  routingDates,
  personnelRates,
  currency,
  statusOf,
  saveDayStatus,
  rateTypes,
  amountMap,
}: {
  routingDates: RoutingDay[];
  personnelRates: Record<string, unknown>[];
  currency: string;
  /** Lifted from PayrollView's shared usePayrollGrid (PAY-01). */
  statusOf: (personnelId: string, date: string) => string;
  saveDayStatus: (personnelId: string, date: string, status: string) => void | Promise<void>;
  /** b2 — the rate-lines source for the live Total column. */
  rateTypes: RateTypeMeta[];
  amountMap: LineAmountMap;
}) {
  const people = useMemo(() => personnelRates.map(toPerson), [personnelRates]);
  const ratesById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const money = useMemo(
    () =>
      new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: (currency || 'GBP').trim().toUpperCase(),
        maximumFractionDigits: 0,
      }),
    [currency],
  );
  // MTX-06 live total — calc columns render via the Grid's fx; pass a minimal one
  // so the Total formats in the tour currency (no conversion — rates are native).
  const fx: GridFx = useMemo(
    () => ({
      displayCurrency: (currency || 'GBP').toUpperCase(),
      currencies: [(currency || 'GBP').toUpperCase()],
      toDisplay: (amount: number) => amount,
      symbol: () => '',
      formatDisplay: (amount: number) => money.format(Number(amount) || 0),
    }),
    [currency, money],
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

  const columns: Column[] = useMemo(() => {
    const dayIds = days.map((d) => d.date);
    // MTX-06 LIVE total (#5) — computed from the row's OWN live day-status cells
    // + the person's rate card (closure), via the SAME fees.ts computeTotalFee
    // (+ rate-card advance) as Rates / Summary / the budget reconcile — so the
    // live cell can't diverge from the persisted total (no PAY-04 redux). calc
    // re-runs on every render, so a day edit ticks the Total instantly.
    const totalCalc = (row: Row): number => {
      const p = ratesById.get(String(row._uid));
      if (!p) return 0;
      const dayStatuses: Record<string, string> = {};
      for (const id of dayIds) dayStatuses[id] = String(row[id] ?? '');
      const counts = countDayStatuses(dayStatuses);
      // b2 — fee from the person's rate lines (dynamic types), same engine as
      // Rates / Summary / the budget reconcile, so the live cell can't diverge.
      return personTotals(amountMap, p.id, rateTypes, counts).totalFee;
    };
    return [
      // person + a frozen Total column (frozenCols=2). Fixed widths so the
      // second frozen column's sticky-left offset is deterministic.
      { id: 'person', label: 'Person', type: 'text', ro: true, w: 180, min: 180, resize: false },
      { id: '__total', label: 'Total', type: 'calc', w: 104, min: 104, resize: false, calc: totalCalc },
      ...days.map<Column>((d) => ({ id: d.date, label: d.date.slice(5), type: 'dropdown', options: DAY_CODES, optColors: DAY_OPTCOLORS, optLabels: DAY_OPTLABELS, w: 92, min: 76, resize: true })),
    ];
  }, [days, ratesById, rateTypes, amountMap]);

  const data: Section[] = useMemo(() => {
    const rows: Row[] = people.map((p) => {
      const row: Row = { _uid: p.id, person: p.person_name };
      for (const d of days) row[d.date] = statusOf(p.id, d.date);
      return row;
    });
    return [{ name: 'Personnel', kind: 'normal', _uid: 'payroll', rows }];
  }, [people, days, statusOf]);

  if (people.length === 0) {
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>No personnel on this tour yet.</div>;
  }

  return (
    <Grid
      key={`payroll-days:${people.length}:${days.length}`}
      initialColumns={columns}
      initialData={data}
      fx={fx}
      wide
      frozenCols={2}
      allowAddRows={false}
      fillHandle
      clickTwiceToOpen
      tabOpensMenu
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
