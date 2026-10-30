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
import { BRUSH_TYPES, brushTypeToStatus, type BrushType } from '@/lib/payroll/effectiveDayType';
import { getWeekStart, formatWeekLabel } from '@/lib/routing/week';
import { DEFAULT_RATE_TYPE_IDS, type RateTypeMeta } from '@/lib/payroll/rateLines';
import { amountOf, weekTotals, type LineAmountMap } from './rateLinesClient';
import { dayTypeSwatch, statusSwatch } from '@/lib/sheetPalette';
import type { RoutingDay, PayrollPerson } from './usePayrollGrid';

/** Fee-shape flags for a person, from their amounts (replaces the retired
 *  rate_type). When NO per-day fee is set, painting days doesn't scale the fee
 *  — cells dim and a note explains why (flat tour / per-diem-only people). */
function feeShapeOf(map: LineAmountMap, personnelRateId: string): { perDayFee: boolean; note: string | null; tag?: string } {
  const id = DEFAULT_RATE_TYPE_IDS;
  const perDayFee =
    amountOf(map, personnelRateId, id.dayRate) > 0 ||
    amountOf(map, personnelRateId, id.show) > 0 ||
    amountOf(map, personnelRateId, id.offTravel) > 0 ||
    amountOf(map, personnelRateId, id.rehearsal) > 0 ||
    amountOf(map, personnelRateId, id.pressRadio) > 0;
  if (perDayFee) return { perDayFee, note: null };
  if (amountOf(map, personnelRateId, id.flatTour) > 0) return { perDayFee, note: 'days don’t change the flat fee — per diem still counts', tag: 'flat fee' };
  if (amountOf(map, personnelRateId, id.perDiem) > 0) return { perDayFee, note: 'per diem only — no daily fee', tag: 'PD only' };
  return { perDayFee, note: null };
}

// Week cards (Oct 2026 design pass): a sticky person column, seven equal day
// columns that fill the card (floor DAY_W), the week's totals on the right.
const PERSON_W = 220;
const DAY_W = 96;
const FEE_W = 104;
const PD_W = 92;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "4 Nov" for slot i of the week starting `weekStart` (yyyy-mm-dd, a Monday). */
function dayLabel(weekStart: string, i: number): string {
  const d = new Date(`${weekStart}T12:00:00`);
  d.setDate(d.getDate() + i);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The tour's day type for a column, as a small chip on its sheet colour. */
function DayTypeChip({ dayType }: { dayType?: string | null }) {
  const sw = dayTypeSwatch(dayType);
  if (!sw) return null;
  return <span className="pay-daytype" style={{ background: sw.bg, color: sw.fg }}>{sw.label}</span>;
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
  oneOffFee = 0,
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
  /** Advances + flat tour fees across everyone (computed by the view with the
   *  same engine). They're in the totals but in no week — the note says so. */
  oneOffFee?: number;
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

  const oneOffNote = oneOffFee > 0
    ? `Advances and flat tour fees (${money.format(oneOffFee)} in all) aren’t in any week — they’re in each person’s total in the Summary.`
    : null;

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
    return <div className="pay-card" style={{ padding: 16 }}><span className="pay-hint">No one on this tour yet — add people to start payroll.</span></div>;
  }

  const brushLabel = BRUSH_TYPES.find((b) => b.value === brush)?.label;
  const gridCols = `${PERSON_W}px repeat(7, minmax(${DAY_W}px, 1fr)) ${FEE_W}px ${PD_W}px`;

  return (
    <section aria-label="Days" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="pay-days-head">
        <h2 className="pay-section-title">Days</h2>
        <span className="pay-hint">Paint who worked what. Pay follows the day type.</span>
      </div>

      {/* Brush bar — sticks to the top while the weeks scroll under it. */}
      <div className="pay-toolbar">
        <div role="radiogroup" aria-label="Day-type brush" className="pay-brush">
          {BRUSH_TYPES.map((b) => {
            const on = brush === b.value;
            const sw = statusSwatch(brushTypeToStatus(b.value, 'show'));
            const k = b.value === 'tour_default' ? 'default' : b.value === 'no_tour' ? 'none' : undefined;
            return (
              <button key={b.value} type="button" role="radio" aria-checked={on} onClick={() => setBrush(b.value)} disabled={finalized}>
                <span aria-hidden className="pay-swatch" data-k={k} style={k ? undefined : { background: sw?.bg }} />
                {b.label}
              </button>
            );
          })}
        </div>
        <span className="pay-hint">Click or drag to paint · <kbd>Shift</kbd>+click for a run · arrows + <kbd>Enter</kbd></span>
        <button type="button" className="pay-btn pay-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setFillOpen(true)} disabled={finalized}>
          Fill all…
        </button>
      </div>

      {/* Oct 2026 — WEEK CARDS, like Adam's weekly payroll tabs: one Mon–Sun
          card per week, date / city / day type above each column, days written
          in full on his sheet colours, and the week's fee / per diem per person
          on the right. Every cell keeps its GLOBAL (row, day-index) address, so
          drag-rectangles, Shift+click runs and arrow keys work across weeks. */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`Payroll days — painting ${brushLabel ?? ''}`}
        className="pay-weeks"
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
            <section key={wk.start} aria-label={`Week commencing ${wk.label}`} className="pay-card">
              <div className="pay-card-head">
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="pay-card-title">Week of {wk.label}</span>
                  <span className="pay-card-hint">{weekDates.length} tour {weekDates.length === 1 ? 'day' : 'days'}</span>
                </span>
                <span className="pay-card-figs">
                  <span>Fees <b>{money.format(sumFee)}</b></span>
                  <span>Per diem <b>{money.format(sumPd)}</b></span>
                </span>
              </div>
              <div className="pay-week-scroll">
                <div className="pay-week-grid" style={{ gridTemplateColumns: gridCols, minWidth: PERSON_W + 7 * DAY_W + FEE_W + PD_W }}>
                  <div className="pay-th pay-person">Person</div>
                  {wk.slots.map((slot, i) => (
                    <div key={i} className="pay-th pay-th-day" data-off={slot ? undefined : 'true'}>
                      <span>{WEEKDAYS[i]}</span>
                      <span className="pay-th-date">{dayLabel(wk.start, i)}</span>
                      <span className="pay-th-city" title={slot?.day.city || slot?.day.venue_name || undefined}>
                        {slot ? (slot.day.city || slot.day.venue_name || '—') : 'No tour'}
                      </span>
                      {slot ? <DayTypeChip dayType={slot.day.day_type} /> : <span className="pay-daytype" aria-hidden>&nbsp;</span>}
                    </div>
                  ))}
                  <div className="pay-th" data-align="end">Fee</div>
                  <div className="pay-th" data-align="end">Per diem</div>

                  {people.map((p, r) => {
                    const shape = feeShapeOf(amountMap, p.id);
                    const rowFlat = !shape.perDayFee && shape.note !== null;
                    const focus = !!focusRowId && p.id === focusRowId ? 'true' : undefined;
                    const w = weekSums[r];
                    return (
                      <Fragment key={p.id}>
                        <div data-matrix-row-id={p.id} data-focus={focus} className="pay-td pay-person" title={rowFlat && shape.note ? `${p.person_name} — ${shape.note}` : undefined}>
                          <span className="pay-person-name">
                            <span>{p.person_name || '—'}</span>
                            {rowFlat ? <span className="pay-tag">{shape.tag ?? 'flat'}</span> : null}
                          </span>
                          {p.role ? <span className="pay-person-role">{p.role}</span> : null}
                        </div>
                        {wk.slots.map((slot, i) => {
                          if (!slot) return <div key={i} className="pay-td pay-td-out" data-focus={focus} aria-hidden />;
                          const { day: d, c } = slot;
                          const status = statusOf(p.id, d.date);
                          const swatch = statusSwatch(status);
                          const isCursor = cursor?.r === r && cursor?.c === c;
                          const inPreview = !!dragRect
                            && r >= Math.min(dragRect.anchor.r, dragRect.cursor.r) && r <= Math.max(dragRect.anchor.r, dragRect.cursor.r)
                            && c >= Math.min(dragRect.anchor.c, dragRect.cursor.c) && c <= Math.max(dragRect.anchor.c, dragRect.cursor.c);
                          return (
                            <div
                              key={d.date}
                              className="pay-td pay-day"
                              data-cursor={isCursor ? 'true' : undefined}
                              data-locked={finalized ? 'true' : undefined}
                              data-focus={focus}
                              onMouseDown={(e) => onCellDown(p.id, d.date, r, c, e.shiftKey)}
                              onMouseEnter={() => onCellEnter(r, c)}
                              title={`${p.person_name} · ${d.date}${swatch ? ` · ${swatch.label}` : ' · not working'}`}
                            >
                              {inPreview ? (
                                <span className="pay-chip" data-preview="true">{swatch?.label ?? ''}</span>
                              ) : swatch ? (
                                <span className="pay-chip" data-dim={rowFlat ? 'true' : undefined} style={{ background: swatch.bg, color: swatch.fg }}>{swatch.label}</span>
                              ) : (
                                <span className="pay-chip-empty" />
                              )}
                            </div>
                          );
                        })}
                        <div className="pay-td pay-td-num" data-strong="true" data-focus={focus}>{w.fee ? money.format(w.fee) : '—'}</div>
                        <div className="pay-td pay-td-num" data-muted="true" data-focus={focus}>{w.perDiem ? money.format(w.perDiem) : '—'}</div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
        {oneOffNote ? <p className="pay-note">{oneOffNote}</p> : null}
      </div>

      {fillOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Fill all days" onClick={() => setFillOpen(false)} className="pay-dialog-scrim">
          <div onClick={(e) => e.stopPropagation()} className="pay-dialog">
            <h3>Fill all days</h3>
            <p>
              Paints <strong style={{ color: 'var(--lp-text)' }}>{brushLabel}</strong> for every person on every day.
              {explicitCount > 0 ? (
                <> <strong style={{ color: 'var(--lp-orange)' }}>{explicitCount}</strong> hand-edited {explicitCount === 1 ? 'day' : 'days'} would be overwritten.</>
              ) : (
                <> No days have been hand-edited yet.</>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button type="button" className="pay-option" data-primary="true" onClick={() => runFill('untouched')}>
                Fill only untouched days
                <small>Keeps your hand-edited days as they are (recommended)</small>
              </button>
              <button type="button" className="pay-option" onClick={() => runFill('all')}>
                Overwrite everything
                <small>Replaces every day, including hand-edited ones</small>
              </button>
              <button type="button" className="pay-btn pay-btn-ghost" style={{ alignSelf: 'flex-end', border: 0 }} onClick={() => setFillOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
