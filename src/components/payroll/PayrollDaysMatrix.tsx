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

/** Per-row rate-type label for the left block (Adam's DELTA — carried beside the
 *  name so the person's type is visible while painting). */
const RATE_TYPE_LABEL: Record<string, string> = {
  day_rate: 'Day rate',
  split_rate: 'Split',
  flat_tour: 'Flat tour',
  weekly: 'Weekly',
  per_diem_only: 'Per diem only',
};

/** Rate types whose FEE moves with painted days (split by day-status, or flat per
 *  active day). For everything else — Flat tour (fixed), Weekly (per week), Per
 *  diem only (no fee) — painting days does NOT scale the fee, so worked cells
 *  render dimmed, the day count is marked (18*), and a row note explains why. */
const FEE_MOVES_WITH_DAYS = new Set(['split_rate', 'day_rate']);
const isFlatFee = (rateType: string) => !FEE_MOVES_WITH_DAYS.has(rateType);
const FLAT_NOTE: Record<string, string> = {
  flat_tour: 'days don’t change the flat fee — per diem still counts',
  weekly: 'days set the week count — per diem still counts',
  per_diem_only: 'per diem only — no daily fee',
};

// G2-2b GRID QUALITY PASS — exact metrics from CC_G2_BUILD.md §G2-2b.
// The left block carries identity + numbers; the matrix fills the page.
const PERSON_W = 320;   // left block, fixed
const DAY_W = 64;       // day column min-width (uniform, table-layout:fixed)
const ROW_H = 52;       // every row, uniform
const HEADER_H = 64;    // three-line day header with breathing room
// Theme-aware mappings of the spec's dark-mode literals (the app is dual-theme):
//   hairline  rgba(255,255,255,.04)  → --lp-border-subtle (the dense-table border token)
//   empty cell #141416 (barely-lifted field, not pure black) → surface mixed toward bg
const HAIRLINE = 'var(--lp-border-subtle)';
const EMPTY_CELL = 'color-mix(in srgb, var(--lp-surface) 45%, var(--lp-bg))';
const WEEK_RULE = 'color-mix(in srgb, var(--lp-orange) 22%, var(--lp-border-strong))';

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
  // Text NEVER dictates column width — everything truncates with a title tooltip.
  const ell: React.CSSProperties = { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' };
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center',
        gap: 2, lineHeight: 1.2, padding: '6px 8px', height: HEADER_H, width: '100%', minWidth: 0,
        boxSizing: 'border-box', textAlign: 'center',
      }}
    >
      {weekStart ? (
        <span style={{ ...ell, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
          {formatWeekLabel(getWeekStart(day.date))}
        </span>
      ) : null}
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)', whiteSpace: 'nowrap', fontFamily: 'var(--lp-font-numeric)' }}>{day.date ? day.date.slice(5) : ''}</span>
      {day.venue_name ? (
        <span title={day.venue_name} style={{ ...ell, fontSize: 11.5, fontWeight: 600, color: 'var(--lp-text-secondary)' }}>{day.venue_name}</span>
      ) : null}
      {day.city ? (
        <span title={day.city} style={{ ...ell, fontSize: 11, color: 'var(--lp-text-tertiary)' }}>{day.city}</span>
      ) : null}
      {dt ? (
        <span title={labelForDayType(dt) || dt} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, maxWidth: '100%', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: colourForDayType(dt) }}>
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
  focusRowId,
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
  /** PAY-09 deep-link — the person row (personnel_rates.id) to flash + scroll to
   *  on landing. Null clears the ring; the caller owns the fade timer. */
  focusRowId?: string | null;
}) {
  const people = useMemo(() => personnelRates.map(toPerson), [personnelRates]);
  // Per-person rate_type (for the left-block "· Day rate" label).
  const rateTypeById = useMemo(
    () => new Map(personnelRates.map((pr) => [pr.id as string, (pr.rate_type as string) ?? 'day_rate'])),
    [personnelRates],
  );
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
  // G2-2b — hover (row tint + cell brighten) and horizontal-scroll (sticky-left
  // shadow depth cue) are presentational state only.
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [scrolledX, setScrolledX] = useState(false);
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
      touched.current.add(`${personId}:${date}`);
      if (mode === 'erase') void saveDayStatus(personId, date, 'no_tour');
      else void saveDayType(personId, date, brush);
    },
    [brush, saveDayStatus, saveDayType],
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

  // Live per-person stats from the row's own cells (same fees.ts engine as
  // Rates / the budget reconcile) — day counts + fee + per-diem for the left block.
  const statsFor = useCallback(
    (personId: string) => {
      const statuses: Record<string, string> = {};
      for (const d of days) statuses[d.date] = statusOf(personId, d.date);
      const counts = countDayStatuses(statuses);
      const t = personTotals(amountMap, personId, rateTypes, counts);
      return { counts, fee: t.totalFee, pd: t.totalPerDiem };
    },
    [days, statusOf, amountMap, rateTypes],
  );

  // Aggregate totals bar (fees · per diem · total) across everyone.
  const totals = useMemo(() => {
    let fee = 0, pd = 0;
    for (const p of people) { const s = statsFor(p.id); fee += s.fee; pd += s.pd; }
    return { fee, pd, total: fee + pd };
  }, [people, statsFor]);

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
    return <div style={{ padding: 16, color: 'var(--lp-text-secondary)', fontSize: 13 }}>No personnel on this tour yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>
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

      {/* Matrix — CSS GRID (not a <table>): grid-template-columns pins the left
          block at 320px and gives EVERY day column minmax(64px, 1fr) → identical
          widths that fill the page and floor at 64px (scrolls when days×64 exceeds
          the container). grid-auto-rows fixes every data row at 52px, header 64px.
          Using grid (no td/th) also sidesteps the global [data-lp-density] td/th
          padding/font rules that were collapsing the table. */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
        onScroll={(e) => { const x = e.currentTarget.scrollLeft > 0; setScrolledX((prev) => (prev === x ? prev : x)); }}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${HAIRLINE}`, borderRadius: 'var(--lp-radius-md)', outline: 'none', userSelect: 'none', background: EMPTY_CELL }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${PERSON_W}px repeat(${days.length}, minmax(${DAY_W}px, 1fr))`,
            gridTemplateRows: `${HEADER_H}px`,
            gridAutoRows: `${ROW_H}px`,
            minWidth: PERSON_W + days.length * DAY_W,
          }}
        >
          {/* Header row — corner (sticky top+left) + day headers (sticky top). */}
          <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 6, display: 'flex', alignItems: 'flex-end', background: 'var(--lp-panel)', padding: '0 12px 8px', borderBottom: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)', fontWeight: 700, boxShadow: scrolledX ? '8px 0 16px -8px rgba(0,0,0,0.5)' : undefined }}>
            Person · days · total
          </div>
          {days.map((d) => (
            <div key={d.date} style={{ position: 'sticky', top: 0, zIndex: 4, background: 'var(--lp-panel)', borderBottom: `1px solid ${HAIRLINE}`, borderLeft: weekStartDates.has(d.date) ? `1px solid ${WEEK_RULE}` : `1px solid ${HAIRLINE}`, overflow: 'hidden', minWidth: 0 }}>
              <DayHeader day={d} weekStart={weekStartDates.has(d.date)} />
            </div>
          ))}

          {/* Data rows — each person is one left-block cell + N day cells. */}
          {people.map((p, r) => {
            const rowFlat = isFlatFee(rateTypeById.get(p.id) ?? 'day_rate');
            const rowHover = hover?.r === r;
            const isFocusRow = !!focusRowId && p.id === focusRowId;
            const leftBg = rowHover ? 'color-mix(in srgb, var(--lp-orange) 6%, var(--lp-surface))' : 'var(--lp-surface)';
            const s = statsFor(p.id);
            const rtKey = rateTypeById.get(p.id) ?? 'day_rate';
            const rt = RATE_TYPE_LABEL[rtKey] ?? 'Day rate';
            const flat = isFlatFee(rtKey);
            const countBits = [
              s.counts.show ? `${s.counts.show} S` : null,
              s.counts.offTravel ? `${s.counts.offTravel} O` : null,
              s.counts.rehearsal ? `${s.counts.rehearsal} R` : null,
            ].filter(Boolean).join(' · ');
            return (
              <Fragment key={p.id}>
                {/* Left block (sticky-left). */}
                <div data-matrix-row-id={p.id} style={{ position: 'sticky', left: 0, zIndex: 3, minWidth: 0, background: leftBg, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, transition: 'background 120ms ease-out, box-shadow 200ms ease-out', boxShadow: [isFocusRow ? 'inset 0 2px 0 0 var(--lp-orange), inset 0 -2px 0 0 var(--lp-orange), inset 2px 0 0 0 var(--lp-orange)' : '', scrolledX ? '8px 0 16px -8px rgba(0,0,0,0.5)' : ''].filter(Boolean).join(', ') || undefined }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--lp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                      {p.person_name || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--lp-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                      {p.role ? p.role : ''}{p.role ? ' · ' : ''}{rt}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--lp-text-tertiary)', fontFamily: 'var(--lp-font-numeric)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                      {countBits || '—'}
                      {flat && countBits ? <span style={{ color: 'var(--lp-orange)', fontWeight: 700 }} title={FLAT_NOTE[rtKey]}>{' *'}</span> : null}
                      {flat ? <span style={{ fontStyle: 'italic', color: 'var(--lp-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{`  — ${FLAT_NOTE[rtKey]}`}</span> : null}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--lp-font-numeric)', fontWeight: 700, fontSize: 18, color: 'var(--lp-text)', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                    {money.format(s.fee + s.pd)}
                  </div>
                </div>
                {/* Day cells. */}
                {days.map((d, c) => {
                  const status = statusOf(p.id, d.date);
                  const isCursor = cursor?.r === r && cursor?.c === c;
                  const cellHover = hover?.r === r && hover?.c === c;
                  const inPreview = !!dragRect
                    && r >= Math.min(dragRect.anchor.r, dragRect.cursor.r) && r <= Math.max(dragRect.anchor.r, dragRect.cursor.r)
                    && c >= Math.min(dragRect.anchor.c, dragRect.cursor.c) && c <= Math.max(dragRect.anchor.c, dragRect.cursor.c);
                  const painted = !!STATUS_ABBR[status];
                  const tileFill = inPreview
                    ? 'color-mix(in srgb, var(--lp-orange) 30%, transparent)'
                    : rowFlat
                      ? (painted ? 'color-mix(in srgb, var(--lp-text-tertiary) 12%, transparent)' : 'transparent')
                      : (STATUS_TINT[status] ?? 'transparent');
                  const tileFg = rowFlat ? 'var(--lp-text-tertiary)' : (STATUS_FG[status] ?? 'var(--lp-text-tertiary)');
                  return (
                    <div
                      key={d.date}
                      onMouseDown={(e) => onCellDown(p.id, d.date, r, c, e.shiftKey)}
                      onMouseEnter={() => { onCellEnter(r, c); setHover({ r, c }); }}
                      title={`${p.person_name} · ${d.date}`}
                      style={{
                        minWidth: 0, padding: 3, cursor: 'pointer', boxSizing: 'border-box',
                        background: rowHover ? 'color-mix(in srgb, var(--lp-orange) 5%, transparent)' : (cellHover ? 'color-mix(in srgb, var(--lp-text) 3%, transparent)' : 'transparent'),
                        borderBottom: `1px solid ${HAIRLINE}`,
                        borderLeft: weekStartDates.has(d.date) ? `1px solid ${WEEK_RULE}` : `1px solid ${HAIRLINE}`,
                        boxShadow: [
                          isCursor ? 'inset 0 0 0 2px var(--lp-orange)' : '',
                          isFocusRow ? 'inset 0 2px 0 0 var(--lp-orange), inset 0 -2px 0 0 var(--lp-orange)' : '',
                          isFocusRow && c === days.length - 1 ? 'inset -2px 0 0 0 var(--lp-orange)' : '',
                        ].filter(Boolean).join(', ') || undefined,
                        transition: 'background 120ms ease-out, box-shadow 200ms ease-out',
                      }}
                    >
                      {/* Painted cells render as inset TILES (3px radius). Empty = none. */}
                      {painted || inPreview ? (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 3, background: tileFill, color: tileFg,
                          fontFamily: 'var(--lp-font-numeric)', fontSize: 13, fontWeight: 600,
                          opacity: rowFlat && painted ? 0.75 : 1,
                          filter: cellHover ? 'brightness(1.15)' : undefined,
                          transition: 'filter 120ms ease-out',
                        }}>
                          {STATUS_ABBR[status] ?? ''}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Totals bar (Adam's DELTA) — fees · per diem · total, always under the matrix. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 24, padding: '10px 16px', border: `1px solid ${HAIRLINE}`, borderTop: 'none', borderRadius: '0 0 var(--lp-radius-md) var(--lp-radius-md)', marginTop: -8, background: 'var(--lp-panel)' }}>
        {([['Fees', totals.fee], ['Per diem', totals.pd], ['Total', totals.total]] as [string, number][]).map(([label, val], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-tertiary)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--lp-font-numeric)', fontWeight: i === 2 ? 800 : 600, fontSize: i === 2 ? 20 : 17, color: 'var(--lp-text)', letterSpacing: '-0.01em' }}>{money.format(val)}</span>
          </div>
        ))}
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
