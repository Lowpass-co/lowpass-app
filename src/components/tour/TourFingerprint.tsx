'use client';

/* ============================================================
   LOWPASS — <TourFingerprint> — a tour as one row of days

   Rebuilt Oct 2026 (Adam: "fix the little tour graphics so they don't glitch
   and are clearer"). The old strip graded each tick's HEIGHT by day type
   (shows tall, off days 40%), outlined the next show 1px OUTSIDE its tick,
   lifted ticks on hover and ran a draw-in animation that was switched off
   right after the first paint. At card / row scale that read as a broken
   barcode: squares beside dashes, an orange box poking above the strip, a
   flicker on load and a wobble under the mouse.

   Now it reads like a calendar bar:
     • every day is the SAME height — colour alone says the day type;
     • days before today are dimmed, so progress through the tour is visible;
     • TODAY is a light vertical marker drawn INSIDE the strip's own padding
       (never outside it — nothing pokes out, nothing is clipped). It is not
       orange: festival days are brand orange;
     • it is ALWAYS one line. No stacked second tick, no wrapping; in fill
       mode the days share the width (the gap shrinks on long tours);
     • start / end dates sit under the strip (and "Today" where it falls);
     • no animation and no hover lift — hover just brightens the day and
       opens the popover.

   <DayTypeLegend> is the key, rendered once per page section (not per strip).

   Sizes: card (workspace cards) · row (artist tour rows) · hero (routing).
   Presentational + interactive only. The PARENT resolves data (incl. venue via
   resolveVenue — never raw venue_* columns) into FingerprintDay[].
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DAY_TYPE_TOKEN, colourForDayType } from '@/lib/routing/dayType';
import { getDayTypeLabel } from '@/lib/utils';
// (dayTypesPresent lives in '@/lib/routing/dayTypesPresent' — a plain module,
// because server components call it. Don't export plain functions from here.)

export type FingerprintSize = 'card' | 'row' | 'hero';

export type FingerprintAdvanceState = 'not_started' | 'in_progress' | 'complete' | 'needs_review';

export interface FingerprintDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Free-text day_type, CSV allowed ("show,festival") — the first drives the
   *  colour; every type is named in the popover. */
  dayType: string;
  /** Resolved venue name (parent resolves via resolveVenue — never raw column). */
  venue?: string | null;
  city?: string | null;
  advanceState?: FingerprintAdvanceState | null;
  routingId?: string | null;
}

export interface TourFingerprintProps {
  days: FingerprintDay[];
  size?: FingerprintSize;
  /** Fill mode: the strip spans the container and the days share its width.
   *  Without it each day has a fixed width (demo / dense use). */
  fill?: boolean;
  /** Week-commencing labels under the strip. Defaults on at hero scale. */
  weekMarkers?: boolean;
  /** Start / end date (and "Today") under the strip. Defaults on, except at
   *  hero scale where the week labels do that job. */
  rangeLabels?: boolean;
  /** A second marked day (e.g. the next show when today isn't a tour day). */
  highlightDate?: string | null;
  /** YYYY-MM-DD. Defaults to today (UTC — the same "today" every derived
   *  status line in the app uses, so the strip and "day 25 of 31" agree). */
  today?: string;
  onDayClick?: (day: FingerprintDay, index: number) => void;
  ariaLabel?: string;
  className?: string;
}

interface SizeSpec {
  /** cell height (px) */
  h: number;
  /** fixed cell width when not in fill mode (px) */
  w: number;
  /** gap between cells (px) — fill mode tightens it on long tours */
  gap: number;
  radius: number;
  /** room above / below the cells for the today marker (px) */
  pad: number;
}
const SIZES: Record<FingerprintSize, SizeSpec> = {
  card: { h: 10, w: 6, gap: 2, radius: 2, pad: 3 },
  row: { h: 12, w: 8, gap: 2, radius: 2, pad: 4 },
  hero: { h: 28, w: 12, gap: 3, radius: 3, pad: 5 },
};

/** Fill mode: shrink the gap so a long tour's days stay visible. */
function fillGap(spec: SizeSpec, count: number): number {
  if (count > 90) return 0.5;
  if (count > 45) return 1;
  return spec.gap;
}

function ymd(iso: string | null | undefined): string {
  return (iso ?? '').slice(0, 10);
}

function types(dayType: string): string[] {
  return (dayType || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** "Show Day + Press Day" — every type on the day, for the popover. */
function labelAll(dayType: string): string {
  const t = types(dayType);
  return t.length ? t.map(getDayTypeLabel).join(' + ') : 'Day';
}

/** Day colour: the type's token blended toward the panel — dimmer for days
 *  already gone. One rule, so past/future never disagree between sizes. */
export function dayCellColour(dayType: string, past: boolean): string {
  return `color-mix(in srgb, ${colourForDayType(dayType)} ${past ? 30 : 82}%, var(--lp-panel))`;
}

const ADVANCE_DOT: Record<FingerprintAdvanceState, string> = {
  not_started: 'var(--color-lp-status-not-started)',
  in_progress: 'var(--color-lp-status-in-progress)',
  needs_review: 'var(--color-lp-status-needs-review)',
  complete: 'var(--color-lp-status-complete)',
};
const ADVANCE_LABEL: Record<FingerprintAdvanceState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  complete: 'Complete',
};

function fmtDate(iso: string): string {
  const d = new Date(`${ymd(iso)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtShort(iso: string): string {
  const d = new Date(`${ymd(iso)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Monday-of-week ISO for the week labels. */
function weekStartIso(iso: string): string {
  const d = new Date(`${ymd(iso)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function TourFingerprint({
  days,
  size = 'card',
  fill = false,
  weekMarkers,
  rangeLabels,
  highlightDate,
  today: todayProp,
  onDayClick,
  ariaLabel,
  className,
}: TourFingerprintProps) {
  const spec = SIZES[size];
  const showWeeks = weekMarkers ?? size === 'hero';
  const showRange = rangeLabels ?? size !== 'hero';
  const today = ymd(todayProp ?? new Date().toISOString());
  const highlight = ymd(highlightDate);
  const gap = fill ? fillGap(spec, days.length) : spec.gap;

  const [hover, setHover] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [mounted, setMounted] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Gate the <body> portal (SSR-safe). Nothing visual depends on this flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const openPopover = useCallback((index: number, target: HTMLElement) => {
    setHover({ index, rect: target.getBoundingClientRect() });
  }, []);
  const closePopover = useCallback(() => setHover(null), []);

  if (days.length === 0) {
    return (
      <span className={className} style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
        No dates yet
      </span>
    );
  }

  const first = ymd(days[0].date);
  const last = ymd(days[days.length - 1].date);
  const todayIndex = days.findIndex((d) => ymd(d.date) === today);
  // Position (0–100%) of a day's centre — for the "Today" label under the strip.
  const centrePct = (i: number) => ((i + 0.5) / days.length) * 100;

  const weekLabels: Array<{ index: number; iso: string }> = [];
  if (showWeeks) {
    let lastWeek = '';
    days.forEach((d, i) => {
      const w = weekStartIso(d.date);
      if (w !== lastWeek) {
        weekLabels.push({ index: i, iso: w });
        lastWeek = w;
      }
    });
  }

  const hovered = hover ? days[hover.index] : null;
  const caption = { fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)', lineHeight: '12px' } as const;

  return (
    <div
      className={className}
      style={{
        display: fill ? 'flex' : 'inline-flex',
        flexDirection: 'column',
        gap: 2,
        maxWidth: '100%',
        width: fill ? '100%' : undefined,
        minWidth: 0,
      }}
    >
      <div
        ref={stripRef}
        role="list"
        aria-label={ariaLabel ?? 'Tour days'}
        className="lp-fingerprint"
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          alignItems: 'stretch',
          gap,
          // The today marker lives inside this padding, so nothing overflows.
          padding: `${spec.pad}px 0`,
          width: fill ? '100%' : undefined,
          overflow: fill ? 'hidden' : 'auto hidden',
          scrollbarWidth: 'none',
        }}
      >
        {days.map((day, i) => {
          const date = ymd(day.date);
          const past = date < today;
          const isToday = date === today;
          const isHighlight = !isToday && !!highlight && date === highlight;
          const isHover = hover?.index === i;
          return (
            <button
              key={`${date}-${i}`}
              type="button"
              role="listitem"
              aria-label={`${fmtDate(date)} · ${labelAll(day.dayType)}${isToday ? ' · today' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              onMouseEnter={(e) => openPopover(i, e.currentTarget)}
              onMouseLeave={closePopover}
              onFocus={(e) => openPopover(i, e.currentTarget)}
              onBlur={closePopover}
              onClick={() => onDayClick?.(day, i)}
              style={{
                position: 'relative',
                flex: fill ? '1 1 0' : '0 0 auto',
                width: fill ? undefined : spec.w,
                minWidth: 0,
                height: spec.h,
                padding: 0,
                border: 0,
                borderRadius: spec.radius,
                background: dayCellColour(day.dayType, past),
                filter: isHover ? 'brightness(1.35)' : undefined,
                cursor: onDayClick ? 'pointer' : 'default',
                outline: 'none',
              }}
            >
              {isToday || isHighlight ? (
                <span
                  aria-hidden
                  data-testid={isToday ? 'fingerprint-today' : 'fingerprint-highlight'}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -spec.pad,
                    bottom: -spec.pad,
                    width: 2,
                    transform: 'translateX(-50%)',
                    borderRadius: 1,
                    background: isToday ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
                    // a hairline of panel colour separates it from the cells either side
                    boxShadow: '0 0 0 1px var(--lp-panel)',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Start · Today · End — one line, never wraps. */}
      {showRange ? (
        <div
          aria-hidden
          className="tabular-nums"
          style={{ position: 'relative', height: 12, width: fill ? '100%' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', ...caption }}
        >
          <span style={{ position: 'absolute', left: 0 }}>{fmtShort(first)}</span>
          {/* "Today" only where it can't crowd the start / end dates. */}
          {todayIndex >= 0 && centrePct(todayIndex) > 22 && centrePct(todayIndex) < 78 ? (
            <span
              style={{
                position: 'absolute',
                left: `${centrePct(todayIndex)}%`,
                transform: 'translateX(-50%)',
                color: 'var(--lp-text-secondary)',
                fontWeight: 'var(--lp-weight-medium)',
              }}
            >
              Today
            </span>
          ) : null}
          {last !== first ? <span style={{ position: 'absolute', right: 0 }}>{fmtShort(last)}</span> : null}
        </div>
      ) : null}

      {/* Week-commencing labels (hero). Spacers mirror the cells so labels align. */}
      {showWeeks && weekLabels.length > 1 ? (
        <div style={{ display: 'flex', gap, position: 'relative', height: 12, width: fill ? '100%' : undefined, overflow: 'hidden' }}>
          {days.map((_, i) => {
            const mark = weekLabels.find((w) => w.index === i);
            return (
              <span
                key={i}
                style={{ position: 'relative', flex: fill ? '1 1 0' : '0 0 auto', width: fill ? undefined : spec.w, minWidth: 0 }}
              >
                {mark ? (
                  <span className="tabular-nums" style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', ...caption }}>
                    {fmtShort(mark.iso)}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {mounted && hover && hovered
        ? createPortal(
            <FingerprintPopover rect={hover.rect} day={hovered} isToday={ymd(hovered.date) === today} compact={size !== 'hero'} />,
            document.body,
          )
        : null}
    </div>
  );
}

/* ---- the key — rendered ONCE per section, not per strip ---- */

const LEGEND_LABEL: Record<string, string> = {
  show: 'Show',
  festival: 'Festival',
  travel: 'Travel',
  off: 'Off',
  rehearsal: 'Rehearsal',
  press: 'Press',
  radio: 'Radio',
  tv: 'TV',
};

export function DayTypeLegend({ dayTypes, className }: { dayTypes?: string[]; className?: string }) {
  const list = (dayTypes && dayTypes.length ? dayTypes : ['show', 'travel', 'off']).filter((t) => DAY_TYPE_TOKEN[t]);
  const swatch = (bg: string) => (
    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: bg, flexShrink: 0 }} />
  );
  return (
    <div
      className={className}
      data-testid="day-type-legend"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 'var(--lp-space-3)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        minWidth: 0,
        fontSize: 'var(--lp-text-2xs)',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {list.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {swatch(dayCellColour(t, false))}
          {LEGEND_LABEL[t]}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span aria-hidden style={{ width: 2, height: 10, borderRadius: 1, background: 'var(--lp-text)', flexShrink: 0 }} />
        Today
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {swatch(dayCellColour('show', true))}
        Past
      </span>
    </div>
  );
}

/* ---- popover ---- */

function FingerprintPopover({
  rect,
  day,
  isToday,
  compact = false,
}: {
  rect: DOMRect;
  day: FingerprintDay;
  isToday: boolean;
  compact?: boolean;
}) {
  /* Card / row scale: one line, ALWAYS below the strip (above would cover the
     row's own text), sized to its text and centred on the day — clamped to an
     edge near the viewport sides so it never runs off screen. Hero keeps the
     full card and flips below when there's no room above. */
  const gap = compact ? 6 : 10;
  const estHeight = 150;
  const cx = rect.left + rect.width / 2;
  const placeBelow = compact || rect.top < estHeight + gap;
  const top = placeBelow ? rect.bottom + gap : rect.top - gap;
  const EDGE = 120;
  const vw = window.innerWidth;
  const align: 'left' | 'centre' | 'right' = cx < EDGE ? 'left' : cx > vw - EDGE ? 'right' : 'centre';
  const width = compact ? undefined : 220;
  const left = compact
    ? align === 'left'
      ? Math.max(8, cx - 12)
      : align === 'right'
        ? undefined
        : cx
    : Math.max(8, Math.min(vw - 228, cx - 110));
  const right = compact && align === 'right' ? Math.max(8, vw - cx - 12) : undefined;
  const tx = compact && align === 'centre' ? '-50%' : '0';
  const ty = placeBelow ? '0' : '-100%';
  // Tail x inside the bubble.
  const tail: React.CSSProperties = compact
    ? align === 'left'
      ? { left: 8 }
      : align === 'right'
        ? { right: 8 }
        : { left: '50%', marginLeft: -4 }
    : { left: Math.max(8, Math.min(212, cx - (left as number))) - 4 };
  const where = day.venue ? `${day.venue}${day.city ? ` — ${day.city}` : ''}` : day.city ?? '';
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        right,
        top,
        width,
        transform: `translate(${tx}, ${ty})`,
        zIndex: 'var(--lp-z-tooltip, 60)' as unknown as number,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          boxShadow: 'var(--lp-shadow-lg)',
          padding: compact ? '5px 8px' : '8px 10px',
          ...(compact ? { whiteSpace: 'nowrap' as const } : { width: '100%' }),
        }}
      >
        {compact ? (
          <div style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span className="tabular-nums" style={{ fontWeight: 'var(--lp-weight-medium)' }}>
              {fmtDate(day.date)}
              {isToday ? ' (today)' : ''}
            </span>
            <span style={{ color: 'var(--lp-text-secondary)' }}>
              {` · ${labelAll(day.dayType)}`}
              {day.city ? ` · ${day.city}` : ''}
            </span>
          </div>
        ) : (
          <>
            <div className="tabular-nums" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)' }}>
              {fmtDate(day.date)}
              {isToday ? ' (today)' : ''}
            </div>
            <div style={{ marginTop: 2, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
              {labelAll(day.dayType)}
              {where ? ` · ${where}` : ''}
            </div>
            {day.advanceState ? (
              <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: ADVANCE_DOT[day.advanceState] }} />
                Advance: {ADVANCE_LABEL[day.advanceState]}
              </div>
            ) : null}
          </>
        )}
      </div>
      {/* Tail, pointing back at the day. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          ...tail,
          width: 8,
          height: 8,
          background: 'var(--lp-surface)',
          transform: 'rotate(45deg)',
          ...(placeBelow
            ? { top: -4, borderLeft: '1px solid var(--lp-border-strong)', borderTop: '1px solid var(--lp-border-strong)' }
            : { bottom: -4, borderRight: '1px solid var(--lp-border-strong)', borderBottom: '1px solid var(--lp-border-strong)' }),
        }}
      />
    </div>
  );
}
