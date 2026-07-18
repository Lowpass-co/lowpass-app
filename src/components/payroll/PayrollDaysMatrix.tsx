'use client';

/* ============================================
   LOWPASS — <PayrollDaysMatrix> (G2-1 brush rebuild)

   The graded days matrix: people = rows, routing days = columns, cell =
   person-day. A day-type BRUSH (Tour default / Show / Rehearsal / Travel / Off /
   Promo·Radio) drives what a click/drag paints; the resolved pay status lands in
   day_statuses via the ONE pay path (saveDayType → brushTypeToStatus → the
   money harness's proven mapping). Painting an override DRIVES PAY (Ruling A).

   Interactions: click paints the brush (or erases if the cell already carries
   it); mouse-drag paints/erases a run; Shift+click paints a run to the anchor;
   arrows move a cursor and Enter toggles working (keyboard contract). The frozen
   Total column recomputes live from the row's own cells via the same fees.ts
   engine as Rates / Summary / the budget reconcile.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { countDayStatuses } from '@/lib/payroll/fees';
import { BRUSH_TYPES, brushTypeToStatus, type BrushType } from '@/lib/payroll/effectiveDayType';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { getWeekStart, formatWeekLabel } from '@/lib/routing/week';
import type { RateTypeMeta } from '@/lib/payroll/rateLines';
import { personTotals, type LineAmountMap } from './rateLinesClient';
import type { RoutingDay, PayrollPerson } from './usePayrollGrid';

const STATUS_TINT: Record<string, string> = {
  show: 'color-mix(in srgb, var(--color-lp-day-show) 26%, transparent)',
  off_travel: 'color-mix(in srgb, var(--color-lp-warning) 24%, transparent)',
  rehearsal: 'color-mix(in srgb, var(--lp-violet) 24%, transparent)',
};
const STATUS_FG: Record<string, string> = {
  show: 'var(--color-lp-day-show)',
  off_travel: 'var(--color-lp-warning)',
  rehearsal: 'var(--lp-violet)',
};
const STATUS_ABBR: Record<string, string> = { show: 'S', off_travel: 'T', rehearsal: 'R', no_tour: '' };

const PERSON_W = 176;
const TOTAL_W = 92;
const DAY_W = 62;

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
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        lineHeight: 1.15,
        padding: '4px 2px 3px',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        borderLeft: weekStart ? '2px solid var(--lp-orange)' : undefined,
      }}
    >
      {weekStart ? (
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--lp-orange)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formatWeekLabel(getWeekStart(day.date))}
        </span>
      ) : null}
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>{day.date ? day.date.slice(5) : ''}</span>
      {day.venue_name ? (
        <span title={day.venue_name} style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--lp-text-secondary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.venue_name}</span>
      ) : null}
      {day.city ? (
        <span title={day.city} style={{ fontSize: 8.5, color: 'var(--lp-text-tertiary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.city}</span>
      ) : null}
      {dt ? (
        <span title={labelForDayType(dt) || dt} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: '100%', fontSize: 8, fontWeight: 600, color: colourForDayType(dt) }}>
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
  saveDayType,
  tourDayTypeOf,
  isExplicit,
  fillDays,
  rateTypes,
  amountMap,
}: {
  routingDates: RoutingDay[];
  personnelRates: Record<string, unknown>[];
  currency: string;
  statusOf: (personnelId: string, date: string) => string;
  saveDayStatus: (personnelId: string, date: string, status: string) => void | Promise<void>;
  /** G2-1 brush — paint a brush type (resolved to a status via the SSOT). */
  saveDayType: (personnelId: string, date: string, brush: BrushType) => void | Promise<void>;
  tourDayTypeOf: (date: string) => string | undefined;
  /** Whether a person-day was hand-set (vs inheriting) — for Fill-all. */
  isExplicit: (personnelId: string, date: string) => boolean;
  fillDays: (personnelId: string, pairs: { date: string; status: string }[]) => void | Promise<void>;
  rateTypes: RateTypeMeta[];
  amountMap: LineAmountMap;
}) {
  const people = useMemo(() => personnelRates.map(toPerson), [personnelRates]);
  const days = useMemo(
    () => [...routingDates].filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date)),
    [routingDates],
  );
  const weekStartDates = useMemo(() => {
    const set = new Set<string>();
    let prev: string | null = null;
    for (const d of days) {
      const w = getWeekStart(d.date);
      if (w !== prev) { set.add(d.date); prev = w; }
    }
    return set;
  }, [days]);

  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'GBP').trim().toUpperCase(), maximumFractionDigits: 0 }),
    [currency],
  );

  const [brush, setBrush] = useState<BrushType>('tour_default');
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Drag paint/erase: set at mousedown, applied on enter until mouseup.
  const drag = useRef<{ active: boolean; mode: 'paint' | 'erase' } | null>(null);
  // Cells the user has hand-edited — for the (next slice) Fill-all untouched-only.
  const touched = useRef<Set<string>>(new Set());

  useEffect(() => {
    const up = () => { drag.current = null; };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);

  const paint = useCallback(
    (personId: string, date: string, mode: 'paint' | 'erase') => {
      touched.current.add(`${personId}:${date}`);
      if (mode === 'erase') void saveDayStatus(personId, date, 'no_tour');
      else void saveDayType(personId, date, brush);
    },
    [brush, saveDayStatus, saveDayType],
  );

  // Fill-all (work-backwards): paint the active brush across everyone × every day.
  const [fillOpen, setFillOpen] = useState(false);
  const explicitCount = useMemo(() => {
    if (!fillOpen) return 0;
    let n = 0;
    for (const p of people) for (const d of days) if (isExplicit(p.id, d.date)) n++;
    return n;
  }, [fillOpen, people, days, isExplicit]);

  const runFill = useCallback(
    (mode: 'untouched' | 'all') => {
      for (const p of people) {
        const pairs: { date: string; status: string }[] = [];
        for (const d of days) {
          if (mode === 'untouched' && isExplicit(p.id, d.date)) continue;
          pairs.push({ date: d.date, status: brushTypeToStatus(brush, tourDayTypeOf(d.date)) });
        }
        for (const d of days) touched.current.add(`${p.id}:${d.date}`);
        void fillDays(p.id, pairs);
      }
      setFillOpen(false);
    },
    [people, days, isExplicit, brush, tourDayTypeOf, fillDays],
  );

  // Live total per person from the row's own cells (same fees.ts engine).
  const totalFor = useCallback(
    (personId: string): number => {
      const statuses: Record<string, string> = {};
      for (const d of days) statuses[d.date] = statusOf(personId, d.date);
      return personTotals(amountMap, personId, rateTypes, countDayStatuses(statuses)).totalFee;
    },
    [days, statusOf, amountMap, rateTypes],
  );

  const onCellDown = (personId: string, date: string, r: number, c: number, shift: boolean) => {
    setCursor({ r, c });
    const target = brushTypeToStatus(brush, tourDayTypeOf(date));
    const current = statusOf(personId, date);
    const mode: 'paint' | 'erase' = current === target && target !== 'no_tour' ? 'erase' : 'paint';
    if (shift && cursor) {
      // Paint a run across the row from the anchor column to here.
      const [lo, hi] = cursor.c <= c ? [cursor.c, c] : [c, cursor.c];
      for (let cc = lo; cc <= hi; cc++) paint(personId, days[cc].date, 'paint');
      return;
    }
    drag.current = { active: true, mode };
    paint(personId, date, mode);
  };

  const onCellEnter = (personId: string, date: string) => {
    if (drag.current?.active) paint(personId, date, drag.current.mode);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!cursor) return;
    const nRows = people.length, nCols = days.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((p) => (p ? { ...p, r: Math.min(p.r + 1, nRows - 1) } : p)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((p) => (p ? { ...p, r: Math.max(p.r - 1, 0) } : p)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCursor((p) => (p ? { ...p, c: Math.min(p.c + 1, nCols - 1) } : p)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor((p) => (p ? { ...p, c: Math.max(p.c - 1, 0) } : p)); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const p = people[cursor.r], d = days[cursor.c];
      if (!p || !d) return;
      // Enter toggles working: off if currently engaged, else paint the brush.
      const current = statusOf(p.id, d.date);
      if (current !== 'no_tour' && current !== '') paint(p.id, d.date, 'erase');
      else paint(p.id, d.date, 'paint');
    } else if (e.key === 'Escape') { setCursor(null); }
  };

  if (people.length === 0) {
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>No personnel on this tour yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Brush toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-tertiary)' }}>Brush</span>
        <div role="radiogroup" aria-label="Day-type brush" style={{ display: 'inline-flex', gap: 2, border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-full)', padding: 3, background: 'var(--lp-panel)' }}>
          {BRUSH_TYPES.map((b) => {
            const on = brush === b.value;
            const st = brushTypeToStatus(b.value, 'show'); // representative colour
            return (
              <button
                key={b.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setBrush(b.value)}
                style={{
                  border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-full)', padding: '4px 12px', fontSize: 12, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: on ? 'var(--lp-orange)' : 'transparent',
                  color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                }}
              >
                {b.value !== 'tour_default' ? (
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: STATUS_FG[st] ?? 'var(--lp-text-tertiary)', opacity: on ? 1 : 0.8 }} />
                ) : null}
                {b.label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>click / drag to paint · Shift+click for a run · arrows + Enter</span>
        <button
          type="button"
          onClick={() => setFillOpen(true)}
          style={{ marginLeft: 'auto', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-bg)', color: 'var(--lp-text)', borderRadius: 'var(--lp-radius-md)', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Fill all…
        </button>
      </div>

      {/* Matrix */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{ overflowX: 'auto', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', outline: 'none', userSelect: 'none' }}
      >
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 3, width: PERSON_W, minWidth: PERSON_W, background: 'var(--lp-panel)', textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--lp-border)', borderRight: '1px solid var(--lp-border)', fontSize: 11, color: 'var(--lp-text-tertiary)', fontWeight: 700 }}>Person</th>
              <th style={{ position: 'sticky', left: PERSON_W, zIndex: 3, width: TOTAL_W, minWidth: TOTAL_W, background: 'var(--lp-panel)', textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--lp-border)', borderRight: '1px solid var(--lp-border-strong)', fontSize: 11, color: 'var(--lp-text-tertiary)', fontWeight: 700 }}>Total</th>
              {days.map((d) => (
                <th key={d.date} style={{ width: DAY_W, minWidth: DAY_W, background: 'var(--lp-panel)', borderBottom: '1px solid var(--lp-border)', padding: 0, verticalAlign: 'bottom' }}>
                  <DayHeader day={d} weekStart={weekStartDates.has(d.date)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p, r) => (
              <tr key={p.id}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, width: PERSON_W, minWidth: PERSON_W, background: 'var(--lp-surface)', padding: '6px 10px', borderBottom: '1px solid var(--lp-border-subtle)', borderRight: '1px solid var(--lp-border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ fontWeight: 600, color: 'var(--lp-text)' }}>{p.person_name || '—'}</span>
                  {p.role ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--lp-text-tertiary)' }}>{p.role}</span> : null}
                </td>
                <td style={{ position: 'sticky', left: PERSON_W, zIndex: 2, width: TOTAL_W, minWidth: TOTAL_W, background: 'var(--lp-surface)', padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--lp-border-subtle)', borderRight: '1px solid var(--lp-border-strong)', fontFamily: 'var(--lp-font-numeric)', color: 'var(--lp-text)' }}>
                  {money.format(totalFor(p.id))}
                </td>
                {days.map((d, c) => {
                  const status = statusOf(p.id, d.date);
                  const isCursor = cursor?.r === r && cursor?.c === c;
                  return (
                    <td
                      key={d.date}
                      onMouseDown={(e) => onCellDown(p.id, d.date, r, c, e.shiftKey)}
                      onMouseEnter={() => onCellEnter(p.id, d.date)}
                      title={`${p.person_name} · ${d.date}`}
                      style={{
                        width: DAY_W, minWidth: DAY_W, height: 30, textAlign: 'center', cursor: 'pointer',
                        borderBottom: '1px solid var(--lp-border-subtle)',
                        borderLeft: weekStartDates.has(d.date) ? '2px solid color-mix(in srgb, var(--lp-orange) 40%, transparent)' : '1px solid var(--lp-border-subtle)',
                        background: STATUS_TINT[status] ?? 'transparent',
                        color: STATUS_FG[status] ?? 'var(--lp-text-tertiary)',
                        fontSize: 10, fontWeight: 700,
                        boxShadow: isCursor ? 'inset 0 0 0 2px var(--lp-orange)' : undefined,
                      }}
                    >
                      {STATUS_ABBR[status] ?? ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fillOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fill all days"
          onClick={() => setFillOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)', padding: 20, boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.35))' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--lp-text)' }}>Fill all days</h3>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--lp-text-secondary)', lineHeight: 1.45 }}>
              Paints <strong style={{ color: 'var(--lp-text)' }}>{BRUSH_TYPES.find((b) => b.value === brush)?.label}</strong> for every person on every day.
              {explicitCount > 0 ? (
                <> <strong style={{ color: 'var(--lp-orange)' }}>{explicitCount}</strong> hand-edited {explicitCount === 1 ? 'cell' : 'cells'} would be overwritten.</>
              ) : (
                <> No cells have been hand-edited yet.</>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => runFill('untouched')}
                style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '9px 14px', fontSize: 13, fontWeight: 600, background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse, #fff)', textAlign: 'left' }}
              >
                Fill only untouched cells
                <span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.85 }}>Keeps your hand-edited days as they are (recommended)</span>
              </button>
              <button
                type="button"
                onClick={() => runFill('all')}
                style={{ border: '1px solid var(--lp-border-strong)', cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '9px 14px', fontSize: 13, fontWeight: 600, background: 'var(--lp-bg)', color: 'var(--lp-text)', textAlign: 'left' }}
              >
                Overwrite everything
                <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--lp-text-tertiary)' }}>Replaces every cell, including hand-edited days</span>
              </button>
              <button
                type="button"
                onClick={() => setFillOpen(false)}
                style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', alignSelf: 'flex-end' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
