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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayCounts } from '@/lib/payroll/fees';
import { BRUSH_TYPES, brushTypeToStatus, type BrushType } from '@/lib/payroll/effectiveDayType';
import { getWeekStart, formatWeekLabel } from '@/lib/routing/week';
import { DEFAULT_RATE_TYPE_IDS, type RateTypeMeta } from '@/lib/payroll/rateLines';
import { amountOf, oneOffTotals, personTotals, weekTotals, type LineAmountMap } from './rateLinesClient';
import { dayTypeSwatch, statusSwatch } from '@/lib/sheetPalette';
import type { RoutingDay, PayrollPerson } from './usePayrollGrid';

/** Fee-shape flags for a person, from their amounts (replaces the retired
 *  rate_type). When NO per-day fee is set, painting days doesn't scale the fee
 *  — cells dim and a note explains why (flat tour / per-diem-only people). */
function feeShapeOf(map: LineAmountMap, personnelRateId: string): { perDayFee: boolean; note: string | null } {
  const id = DEFAULT_RATE_TYPE_IDS;
  const perDayFee =
    amountOf(map, personnelRateId, id.dayRate) > 0 ||
    amountOf(map, personnelRateId, id.show) > 0 ||
    amountOf(map, personnelRateId, id.offTravel) > 0 ||
    amountOf(map, personnelRateId, id.rehearsal) > 0 ||
    amountOf(map, personnelRateId, id.pressRadio) > 0;
  if (perDayFee) return { perDayFee, note: null };
  if (amountOf(map, personnelRateId, id.flatTour) > 0) return { perDayFee, note: 'days don’t change the flat fee — per diem still counts' };
  if (amountOf(map, personnelRateId, id.perDiem) > 0) return { perDayFee, note: 'per diem only — no daily fee' };
  return { perDayFee, note: null };
}

// Oct 2026 — sheet-style week blocks. Fixed identity columns, seven equal
// day columns that fill the page (floor DAY_W), the week's totals on the right.
const ROLE_W = 150;
const NAME_W = 210;
const DAY_W = 104;
const FEE_W = 110;
const PD_W = 92;
const HAIRLINE = 'var(--lp-border-subtle)';
const OUT_OF_TOUR = 'repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--lp-text) 4%, transparent) 6px 7px)';
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const headCell: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', padding: '8px 10px', minWidth: 0,
  fontSize: 'var(--lp-text-2xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text)',
  background: 'var(--lp-panel)', borderBottom: `1px solid var(--lp-border-strong)`, borderRight: `1px solid ${HAIRLINE}`,
};
const bodyCell: React.CSSProperties = {
  display: 'flex', alignItems: 'center', minWidth: 0, height: 44, padding: '0 10px', boxSizing: 'border-box',
  borderBottom: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`,
};
const num: React.CSSProperties = { justifyContent: 'flex-end', fontFamily: 'var(--lp-font-numeric)', fontSize: 'var(--lp-text-base)', color: 'var(--lp-text)' };
const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };

/** "8 Mar" for slot i of the week starting `weekStart` (yyyy-mm-dd, a Monday). */
function dayLabel(weekStart: string, i: number): string {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + i);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The tour's day type for a column, on its sheet colour (his DAY TYPE row). */
function DayTypeStrip({ dayType }: { dayType?: string | null }) {
  const sw = dayTypeSwatch(dayType);
  return (
    <span style={{ display: 'block', margin: '0 -6px', padding: '3px 4px', textAlign: 'center', fontSize: 'var(--lp-text-2xs)', fontWeight: 800, letterSpacing: '0.04em', background: sw?.bg ?? 'transparent', color: sw?.fg ?? 'var(--lp-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {sw?.label ?? '\u00a0'}
    </span>
  );
}

function toPerson(pr: Record<string, unknown>): PayrollPerson {
  return {
    id: pr.id as string,
    person_name: (pr.person_name as string) ?? '',
    role: (pr.role as string) ?? '',
    per_diem: Number(pr.per_diem) || 0,
    advance_fee: Number(pr.advance_fee) || 0,
  };
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
  effectiveCountsFor,
  focusRowId,
  finalized = false,
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
  /** EFFECTIVE day counts (painted + tour-default) — the ONE counting path
   *  shared with the Rates grid, so the two surfaces always agree. */
  effectiveCountsFor: (personnelRateId: string) => DayCounts;
  /** PAY-09 deep-link — the person row (personnel_rates.id) to flash + scroll to
   *  on landing. Null clears the ring; the caller owns the fade timer. */
  focusRowId?: string | null;
  /** M1-C — payroll finalized: painting/fill are no-ops (the server also rejects). */
  finalized?: boolean;
}) {
  const people = useMemo(() => personnelRates.map(toPerson), [personnelRates]);
  const days = useMemo(
    () => [...routingDates].filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date)),
    [routingDates],
  );

  // Mon–Sun weeks; each slot is the routing day on that date (with its GLOBAL
  // index c, the address painting uses) or null when the tour isn't on.
  const weeks = useMemo(() => {
    const byDate = new Map(days.map((d, c) => [d.date.slice(0, 10), { day: d, c }]));
    const starts: string[] = [];
    for (const d of days) {
      const w = getWeekStart(d.date);
      if (starts[starts.length - 1] !== w) starts.push(w);
    }
    return starts.map((start) => {
      const slots = Array.from({ length: 7 }, (_, i) => {
        const dt = new Date(`${start}T12:00:00`);
        dt.setDate(dt.getDate() + i);
        return byDate.get(dt.toISOString().slice(0, 10)) ?? null;
      });
      return { start, label: formatWeekLabel(start).replace(/^WC /, ''), slots };
    });
  }, [days]);

  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'GBP').trim().toUpperCase(), maximumFractionDigits: 0 }),
    [currency],
  );

  const [brush, setBrush] = useState<BrushType>('tour_default');
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  // G2-2b — hover (row tint + cell brighten) and horizontal-scroll (sticky-left
  // shadow depth cue) are presentational state only.
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // PAY-10 — press-drag-release fills the RECTANGLE between anchor and cursor
  // (all rows × all cols in the box). Live preview while dragging; commit on
  // mouseup. (Diagonal N→N is the PATCH matrix's rule, not the days matrix.)
  type DragRect = { anchor: { r: number; c: number }; cursor: { r: number; c: number }; mode: 'paint' | 'erase' };
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const dragRectRef = useRef<DragRect | null>(null);
  useEffect(() => { dragRectRef.current = dragRect; }, [dragRect]);
  // Cells the user has hand-edited — for Fill-all untouched-only.
  const touched = useRef<Set<string>>(new Set());

  // PAY-09 deep-link — scroll the focused person's row into view on landing.
  // The orange ring is inline on that row's cells (isFocusRow below). No-op when
  // unset or when the row isn't in the DOM.
  useEffect(() => {
    if (!focusRowId) return;
    const root = gridRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-matrix-row-id="${CSS.escape(focusRowId)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [focusRowId]);

  const paint = useCallback(
    (personId: string, date: string, mode: 'paint' | 'erase') => {
      if (finalized) return; // M1-C — locked; the server rejects too.
      touched.current.add(`${personId}:${date}`);
      if (mode === 'erase') void saveDayStatus(personId, date, 'no_tour');
      else void saveDayType(personId, date, brush);
    },
    [brush, saveDayStatus, saveDayType, finalized],
  );

  // Commit the whole rectangle between anchor and cursor with the drag's mode.
  const commitRect = useCallback(
    (rect: DragRect) => {
      const r0 = Math.min(rect.anchor.r, rect.cursor.r), r1 = Math.max(rect.anchor.r, rect.cursor.r);
      const c0 = Math.min(rect.anchor.c, rect.cursor.c), c1 = Math.max(rect.anchor.c, rect.cursor.c);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const p = people[r], d = days[c];
          if (p && d) paint(p.id, d.date, rect.mode);
        }
      }
    },
    [people, days, paint],
  );

  useEffect(() => {
    const up = () => {
      const rect = dragRectRef.current;
      if (rect) commitRect(rect);
      setDragRect(null);
    };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, [commitRect]);

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
      if (finalized) { setFillOpen(false); return; } // M1-C — locked.
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
    [people, days, isExplicit, brush, tourDayTypeOf, fillDays, finalized],
  );

  // Live per-person stats via the SHARED effective-counts path (same counts
  // the Rates grid reads) + the same fees.ts engine — the two surfaces agree
  // by construction.
  const statsFor = useCallback(
    (personId: string) => {
      const counts = effectiveCountsFor(personId);
      const t = personTotals(amountMap, personId, rateTypes, counts);
      return { counts, fee: t.totalFee, pd: t.totalPerDiem };
    },
    [effectiveCountsFor, amountMap, rateTypes],
  );

  // Aggregate totals bar (fees · per diem · total) across everyone.
  const totals = useMemo(() => {
    let fee = 0, pd = 0;
    for (const p of people) { const s = statsFor(p.id); fee += s.fee; pd += s.pd; }
    return { fee, pd, total: fee + pd };
  }, [people, statsFor]);

  // The weeks count day-driven pay only; say where the one-offs went.
  const oneOffNote = useMemo(() => {
    let fee = 0;
    for (const p of people) fee += oneOffTotals(amountMap, p.id, rateTypes, effectiveCountsFor(p.id)).fee;
    return fee > 0 ? `Advances and flat tour fees (${money.format(fee)} in all) aren’t in the weeks — they’re in each person’s total in the Summary.` : null;
  }, [people, amountMap, rateTypes, effectiveCountsFor, money]);

  const onCellDown = (personId: string, date: string, r: number, c: number, shift: boolean) => {
    if (shift && cursor) {
      // Shift+click extends a run across the row from the last cell to here.
      const [lo, hi] = cursor.c <= c ? [cursor.c, c] : [c, cursor.c];
      for (let cc = lo; cc <= hi; cc++) paint(people[r].id, days[cc].date, 'paint');
      setCursor({ r, c });
      return;
    }
    setCursor({ r, c });
    // Paint/erase mode is decided from the anchor cell and held for the whole
    // rectangle; commit happens on mouseup (see commitRect).
    const target = brushTypeToStatus(brush, tourDayTypeOf(date));
    const current = statusOf(personId, date);
    const mode: 'paint' | 'erase' = current === target && target !== 'no_tour' ? 'erase' : 'paint';
    setDragRect({ anchor: { r, c }, cursor: { r, c }, mode });
  };

  const onCellEnter = (r: number, c: number) => {
    setDragRect((rect) => (rect ? { ...rect, cursor: { r, c } } : null));
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
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)' }}>No personnel on this tour yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>
      {/* Brush toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-tertiary)' }}>Brush</span>
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
                  border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-full)', padding: '4px 12px', fontSize: 'var(--lp-text-xs)', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: on ? 'var(--lp-orange)' : 'transparent',
                  color: on ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
                }}
              >
                {b.value !== 'tour_default' ? (
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: statusSwatch(st)?.bg ?? 'var(--lp-text-tertiary)', border: '1px solid var(--lp-border-strong)' }} />
                ) : null}
                {b.label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>click / drag to paint · Shift+click for a run · arrows + Enter</span>
        <button
          type="button"
          onClick={() => setFillOpen(true)}
          style={{ marginLeft: 'auto', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-bg)', color: 'var(--lp-text)', borderRadius: 'var(--lp-radius-md)', padding: '5px 12px', fontSize: 'var(--lp-text-xs)', fontWeight: 600, cursor: 'pointer' }}
        >
          Fill all…
        </button>
      </div>

      {/* Totals across the tour — fees · per diem · total. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 24, padding: '2px 4px' }}>
        {([['Fees', totals.fee], ['Per diem', totals.pd], ['Total', totals.total]] as [string, number][]).map(([label, val], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 'var(--lp-text-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--lp-font-numeric)', fontWeight: i === 2 ? 800 : 600, fontSize: i === 2 ? 20 : 16, color: 'var(--lp-text)' }}>{money.format(val)}</span>
          </div>
        ))}
      </div>

      {/* Oct 2026 — WEEK BLOCKS, like Adam's weekly payroll tabs: one Mon–Sun
          block per week, day name / date / city / day type above each column,
          days written in full on his sheet colours, and the week's TOTAL FEE /
          TOTAL PD per person on the right. Interaction is unchanged: every cell
          keeps its GLOBAL (row, day-index) address, so drag-rectangles, Shift+
          click runs and arrow keys work across weeks as they did on the strip. */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'flex', flexDirection: 'column', gap: 18, outline: 'none', userSelect: 'none', paddingBottom: 8 }}
      >
        {weeks.map((wk) => {
          const weekDates = wk.slots.filter((x): x is { day: RoutingDay; c: number } => x !== null);
          const weekSums = people.map((p) => {
            const st: Record<string, string> = {};
            for (const { day } of weekDates) st[day.date] = statusOf(p.id, day.date);
            return weekTotals(amountMap, p.id, rateTypes, st);
          });
          const sumFee = weekSums.reduce((n, w) => n + w.fee, 0);
          const sumPd = weekSums.reduce((n, w) => n + w.perDiem, 0);
          return (
            <section key={wk.start} aria-label={`Week commencing ${wk.label}`} style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 'var(--lp-radius-md)', overflow: 'hidden', background: 'var(--lp-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '8px 14px', background: 'var(--lp-sheet-band-bg)', color: 'var(--lp-sheet-band-fg)' }}>
                <span style={{ fontSize: 'var(--lp-text-md)', fontWeight: 800, letterSpacing: '0.02em' }}>W/C {wk.label}</span>
                <span style={{ fontSize: 'var(--lp-text-sm)', fontFamily: 'var(--lp-font-numeric)', fontWeight: 600, opacity: 0.9 }}>
                  Week fee {money.format(sumFee)} · PD {money.format(sumPd)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `${ROLE_W}px ${NAME_W}px repeat(7, minmax(${DAY_W}px, 1fr)) ${FEE_W}px ${PD_W}px`, minWidth: ROLE_W + NAME_W + 7 * DAY_W + FEE_W + PD_W }}>
                  {/* Header — ROLE · NAME · the seven days · TOTAL FEE · TOTAL PD */}
                  <div style={{ ...headCell, justifyContent: 'flex-start' }}>Role</div>
                  <div style={{ ...headCell, justifyContent: 'flex-start' }}>Name</div>
                  {wk.slots.map((slot, i) => (
                    <div key={i} style={{ ...headCell, flexDirection: 'column', alignItems: 'stretch', gap: 3, padding: '6px 6px 0', opacity: slot ? 1 : 0.4 }}>
                      <span style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 800, letterSpacing: '0.04em' }}>{WEEKDAYS[i]}</span>
                      <span style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 600, fontFamily: 'var(--lp-font-numeric)', color: 'var(--lp-text-secondary)' }}>{dayLabel(wk.start, i)}</span>
                      <span title={slot?.day.city ?? undefined} style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 500, color: 'var(--lp-text)', lineHeight: 1.25, minHeight: 30, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textTransform: 'none', letterSpacing: 0 }}>
                        {slot ? (slot.day.city || slot.day.venue_name || '—') : 'No tour'}
                      </span>
                      <DayTypeStrip dayType={slot?.day.day_type} />
                    </div>
                  ))}
                  <div style={{ ...headCell, justifyContent: 'flex-end' }}>Total fee</div>
                  <div style={{ ...headCell, justifyContent: 'flex-end' }}>Total PD</div>

                  {people.map((p, r) => {
                    const shape = feeShapeOf(amountMap, p.id);
                    const rowFlat = !shape.perDayFee && shape.note !== null;
                    const isFocusRow = !!focusRowId && p.id === focusRowId;
                    const ring = isFocusRow ? 'inset 0 2px 0 0 var(--lp-orange), inset 0 -2px 0 0 var(--lp-orange)' : '';
                    const w = weekSums[r];
                    return (
                      <Fragment key={p.id}>
                        <div data-matrix-row-id={p.id} style={{ ...bodyCell, boxShadow: ring || undefined, fontSize: 'var(--lp-text-sm)', fontWeight: 600, color: 'var(--lp-text-secondary)' }} title={p.role || undefined}>
                          <span style={ellipsis}>{p.role || '—'}</span>
                        </div>
                        <div style={{ ...bodyCell, boxShadow: ring || undefined, fontSize: 'var(--lp-text-base)', fontWeight: 500, color: 'var(--lp-text)' }} title={rowFlat && shape.note ? `${p.person_name} — ${shape.note}` : p.person_name}>
                          <span style={ellipsis}>{p.person_name || '—'}</span>
                          {rowFlat ? <span title={shape.note ?? undefined} style={{ marginLeft: 6, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>flat</span> : null}
                        </div>
                        {wk.slots.map((slot, i) => {
                          if (!slot) return <div key={i} style={{ ...bodyCell, background: OUT_OF_TOUR }} aria-hidden />;
                          const { day: d, c } = slot;
                          const status = statusOf(p.id, d.date);
                          const swatch = statusSwatch(status);
                          const isCursor = cursor?.r === r && cursor?.c === c;
                          const cellHover = hover?.r === r && hover?.c === c;
                          const inPreview = !!dragRect
                            && r >= Math.min(dragRect.anchor.r, dragRect.cursor.r) && r <= Math.max(dragRect.anchor.r, dragRect.cursor.r)
                            && c >= Math.min(dragRect.anchor.c, dragRect.cursor.c) && c <= Math.max(dragRect.anchor.c, dragRect.cursor.c);
                          return (
                            <div
                              key={d.date}
                              onMouseDown={(e) => onCellDown(p.id, d.date, r, c, e.shiftKey)}
                              onMouseEnter={() => { onCellEnter(r, c); setHover({ r, c }); }}
                              title={`${p.person_name} · ${d.date}${swatch ? ` · ${swatch.label}` : ''}`}
                              style={{
                                ...bodyCell, padding: 3, cursor: finalized ? 'default' : 'pointer',
                                boxShadow: [isCursor ? 'inset 0 0 0 2px var(--lp-orange)' : '', ring].filter(Boolean).join(', ') || undefined,
                              }}
                            >
                              {swatch || inPreview ? (
                                <div style={{
                                  width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: 3,
                                  background: inPreview ? 'color-mix(in srgb, var(--lp-orange) 30%, transparent)' : swatch!.bg,
                                  color: inPreview ? 'var(--lp-text)' : swatch!.fg,
                                  fontSize: 'var(--lp-text-2xs)', fontWeight: 800, letterSpacing: '0.03em',
                                  opacity: rowFlat && swatch ? 0.55 : 1,
                                  filter: cellHover ? 'brightness(1.06)' : undefined,
                                }}>
                                  {swatch?.label ?? ''}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                        <div style={{ ...bodyCell, ...num, boxShadow: ring || undefined, fontWeight: 700 }}>{w.fee ? money.format(w.fee) : '—'}</div>
                        <div style={{ ...bodyCell, ...num, boxShadow: ring || undefined, color: 'var(--lp-text-secondary)' }}>{w.perDiem ? money.format(w.perDiem) : '—'}</div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
        {oneOffNote ? <p style={{ margin: 0, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>{oneOffNote}</p> : null}
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
            <p style={{ margin: '8px 0 0', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', lineHeight: 1.45 }}>
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
                style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '9px 14px', fontSize: 'var(--lp-text-sm)', fontWeight: 600, background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse, #fff)', textAlign: 'left' }}
              >
                Fill only untouched cells
                <span style={{ display: 'block', fontSize: 'var(--lp-text-2xs)', fontWeight: 400, opacity: 0.85 }}>Keeps your hand-edited days as they are (recommended)</span>
              </button>
              <button
                type="button"
                onClick={() => runFill('all')}
                style={{ border: '1px solid var(--lp-border-strong)', cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '9px 14px', fontSize: 'var(--lp-text-sm)', fontWeight: 600, background: 'var(--lp-bg)', color: 'var(--lp-text)', textAlign: 'left' }}
              >
                Overwrite everything
                <span style={{ display: 'block', fontSize: 'var(--lp-text-2xs)', fontWeight: 400, color: 'var(--lp-text-tertiary)' }}>Replaces every cell, including hand-edited days</span>
              </button>
              <button
                type="button"
                onClick={() => setFillOpen(false)}
                style={{ border: 0, cursor: 'pointer', borderRadius: 'var(--lp-radius-md)', padding: '7px 14px', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', background: 'transparent', alignSelf: 'flex-end' }}
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
