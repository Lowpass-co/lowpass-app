'use client';

/* ============================================================
   LOWPASS — <TourFingerprint> (Design pass §7 — the signature component)

   A tour rendered as a horizontal strip of day ticks, coloured by (muted)
   day-type hue. ONE component, three sizes:

     - card  (10px ticks)  — workspace / artist rows at a glance
     - row   (14–18px)     — artist tour rows
     - hero  (32–44px)     — the tour-landing hero strip

   Interaction (§7 + §6):
     - hover / focus a tick → it lifts 3–7px and an ANCHORED popover opens
       above it (mono date line · day type · venue — city · advance state) with
       a tail pointing back to the tick. The popover is portalled to <body> and
       positioned from the tick's rect, so a horizontally-scrolling strip never
       clips it. It scales in from its bottom-centre anchor (~140ms).
     - click a tick → onDayClick(day) (callers route show days → advance/grid).
     - two day types on one day → a second tick stacks below (§7 "TR idea").
     - hero scale → week-commencing markers under the strip (§7 "AR pro").
     - wheel over the strip → horizontal scroll (§7).
     - bars draw in once on mount (~20ms/bar); reduced-motion disables draw-in +
       lift + popover scale (global kill-switch + guarded inline styles).

   Presentational + interactive only. The PARENT resolves data (incl. venue via
   resolveVenue — never raw venue_* columns) into FingerprintDay[].
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { firstDayType } from '@/lib/utils';

export type FingerprintSize = 'card' | 'row' | 'hero';

export type FingerprintAdvanceState = 'not_started' | 'in_progress' | 'complete' | 'needs_review';

export interface FingerprintDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Free-text day_type, CSV allowed ("show,festival") — first drives the hue,
   *  a second stacks a tick below. */
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
  /** Fill mode (§C3): the strip spans the full container width and each day's
   *  tick flexes to an equal share instead of a fixed `spec.width`. Heights
   *  still grade by day type. Used on the workspace artist cards so the
   *  fingerprint reads as a full-width graded bar, not a short dense stub. */
  fill?: boolean;
  /** Week-commencing markers under the strip. Defaults on at hero scale. */
  weekMarkers?: boolean;
  /** Outline the tick for this date (e.g. the next upcoming show). */
  highlightDate?: string | null;
  onDayClick?: (day: FingerprintDay, index: number) => void;
  ariaLabel?: string;
  className?: string;
}

interface SizeSpec {
  tick: number;   // full tick height (px)
  width: number;  // tick width (px)
  gap: number;    // gap between ticks (px)
  lift: number;   // hover lift (px)
}
const SIZES: Record<FingerprintSize, SizeSpec> = {
  card: { tick: 10, width: 3, gap: 1, lift: 3 },
  row: { tick: 16, width: 3, gap: 1.5, lift: 4 },
  hero: { tick: 40, width: 5, gap: 2, lift: 7 },
};

/** A day-type's tick renders at a fraction of full height + muted toward the
 *  panel so shows read as the tall, saturated anchor and off/travel recede. */
function intensityFor(dayType: string): { heightPct: number; mix: number } {
  const t = (firstDayType(dayType) || '').toLowerCase();
  if (t === 'show' || t === 'festival') return { heightPct: 1, mix: 62 };
  if (t === 'rehearsal' || t === 'press' || t === 'radio' || t === 'tv') return { heightPct: 0.7, mix: 48 };
  if (t === 'travel') return { heightPct: 0.5, mix: 40 };
  return { heightPct: 0.4, mix: 32 }; // off / unknown
}

/** Muted day-type colour: blend the day token toward the panel (~desaturate). */
function mutedColour(dayType: string): string {
  const token = colourForDayType(dayType);
  const { mix } = intensityFor(dayType);
  return `color-mix(in srgb, ${token} ${mix}%, var(--lp-panel))`;
}

function secondType(dayType: string): string | null {
  const parts = (dayType || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] : null;
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
  // Local-safe parse (avoid UTC off-by-one) + mono-friendly compact form.
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Monday-of-week ISO for the week-commencing markers. */
function weekStartIso(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function TourFingerprint({
  days,
  size = 'card',
  fill = false,
  weekMarkers,
  highlightDate,
  onDayClick,
  ariaLabel,
  className,
}: TourFingerprintProps) {
  const spec = SIZES[size];
  const showWeeks = weekMarkers ?? size === 'hero';
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // One-shot mount flag: gate the <body> portal (SSR-safe) + let bars draw in
    // once. Not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Wheel → horizontal scroll (§7). Only when the strip actually overflows.
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, []);

  const openPopover = useCallback((index: number, target: HTMLElement) => {
    setHover({ index, rect: target.getBoundingClientRect() });
  }, []);
  const closePopover = useCallback(() => setHover(null), []);

  if (days.length === 0) {
    return (
      <span
        className={className}
        style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}
      >
        No dates
      </span>
    );
  }

  // Week-marker positions: first tick index of each new week-commencing group.
  const weekLabels: Array<{ index: number; iso: string }> = [];
  if (showWeeks) {
    let last = '';
    days.forEach((d, i) => {
      const w = weekStartIso(d.date);
      if (w !== last) {
        weekLabels.push({ index: i, iso: w });
        last = w;
      }
    });
  }

  const hovered = hover ? days[hover.index] : null;

  return (
    <div
      className={className}
      style={{
        display: fill ? 'flex' : 'inline-flex',
        flexDirection: 'column',
        gap: 4,
        maxWidth: '100%',
        width: fill ? '100%' : undefined,
      }}
    >
      <div
        ref={stripRef}
        role="list"
        aria-label={ariaLabel ?? 'Tour day strip'}
        onWheel={onWheel}
        className="lp-fingerprint"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: spec.gap,
          height: spec.tick + spec.lift,
          paddingTop: spec.lift,
          // Fill mode divides the full width across ticks, so there's nothing to
          // scroll; fixed-width mode keeps the dense scroll-on-overflow strip.
          width: fill ? '100%' : undefined,
          overflowX: fill ? 'hidden' : 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
        }}
      >
        {days.map((day, i) => {
          const { heightPct } = intensityFor(day.dayType);
          const h = Math.max(3, Math.round(spec.tick * heightPct));
          const second = secondType(day.dayType);
          const isHighlight = !!highlightDate && day.date.slice(0, 10) === highlightDate.slice(0, 10);
          const isHover = hover?.index === i;
          const interactive = !!onDayClick;
          return (
            <button
              key={`${day.date}-${i}`}
              type="button"
              role="listitem"
              aria-label={`${fmtDate(day.date)}${labelForDayType(day.dayType) ? ` · ${labelForDayType(day.dayType)}` : ''}`}
              tabIndex={0}
              onMouseEnter={(e) => openPopover(i, e.currentTarget)}
              onMouseLeave={closePopover}
              onFocus={(e) => openPopover(i, e.currentTarget)}
              onBlur={closePopover}
              onClick={() => onDayClick?.(day, i)}
              className="btn-transition"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'stretch',
                gap: 1,
                // Fill mode: equal flex share + shrinkable; fixed mode: rigid tick.
                width: fill ? undefined : spec.width,
                flex: fill ? '1 1 0' : undefined,
                minWidth: fill ? 0 : undefined,
                height: spec.tick,
                padding: 0,
                border: 0,
                background: 'transparent',
                cursor: interactive ? 'pointer' : 'default',
                transform: isHover ? `translateY(-${spec.lift}px)` : 'none',
                transition: 'transform var(--lp-dur-fast) var(--lp-ease-out)',
                flexShrink: fill ? 1 : 0,
                position: 'relative',
              }}
            >
              {/* VIS-G-07 — forgiving hit target. The visible tick is only
                  3–5px wide; this transparent overlay extends the hover/focus
                  catch area ±6px without changing the dense strip layout
                  (absolute → no flex impact), so the anchored popover opens
                  reliably instead of only on a hair-thin target. */}
              <span
                aria-hidden
                style={{ position: 'absolute', top: 0, bottom: 0, left: -6, right: -6 }}
              />
              {/* Primary tick */}
              <span
                aria-hidden
                style={{
                  display: 'block',
                  width: '100%',
                  height: h,
                  borderRadius: 1,
                  background: mutedColour(day.dayType),
                  outline: isHighlight ? '1.5px solid var(--lp-orange)' : 'none',
                  outlineOffset: 1,
                  transformOrigin: 'bottom',
                  animation: mounted ? undefined : `lp-fp-draw var(--lp-dur-base) var(--lp-ease-out) ${Math.min(i * 20, 600)}ms both`,
                }}
              />
              {/* Second day-type stacks a thin tick below (§7). */}
              {second ? (
                <span
                  aria-hidden
                  style={{
                    display: 'block',
                    width: '100%',
                    height: Math.max(2, Math.round(spec.tick * 0.22)),
                    borderRadius: 1,
                    background: mutedColour(second),
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Week-commencing markers (hero / tour scale). Spacers mirror the tick
          sizing so labels stay aligned — including fill mode's flexed ticks. */}
      {showWeeks && weekLabels.length > 1 ? (
        <div style={{ display: 'flex', gap: spec.gap, position: 'relative', height: 12, width: fill ? '100%' : undefined }}>
          {days.map((_, i) => {
            const mark = weekLabels.find((w) => w.index === i);
            return (
              <span
                key={i}
                style={{
                  width: fill ? undefined : spec.width,
                  flex: fill ? '1 1 0' : undefined,
                  minWidth: fill ? 0 : undefined,
                  flexShrink: fill ? 1 : 0,
                  position: 'relative',
                }}
              >
                {mark ? (
                  <span
                    className="lp-mono"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      whiteSpace: 'nowrap',
                      fontSize: 'var(--lp-text-2xs)',
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    {new Date(`${mark.iso}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Anchored popover — portalled so the scrolling strip never clips it. */}
      {mounted && hover && hovered
        ? createPortal(
            <FingerprintPopover rect={hover.rect} day={hovered} />,
            document.body,
          )
        : null}
    </div>
  );
}

function FingerprintPopover({ rect, day }: { rect: DOMRect; day: FingerprintDay }) {
  const width = 200;
  const gap = 10;
  const estHeight = 150; // typical popover height, for the flip decision
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
  // TR-03 (G1-B #15) — flip below the tick when there isn't room above (tick
  // near the top of the viewport / the routing hero strip), so the popover never
  // renders upward over the columns/chrome above the strip. It never covers the
  // tick itself, and stays pointer-events:none so clicks reach the cell.
  const placeBelow = rect.top < estHeight + gap;
  const top = placeBelow ? rect.bottom + gap : rect.top - gap;
  const anchorX = rect.left + rect.width / 2 - left; // tail x within the popover
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        width,
        transform: placeBelow ? 'translateY(0)' : 'translateY(-100%)',
        transformOrigin: placeBelow ? `${anchorX}px 0%` : `${anchorX}px 100%`,
        animation: 'lp-fp-pop var(--lp-dur-base) var(--lp-ease-out) both',
        zIndex: 'var(--lp-z-tooltip, 60)' as unknown as number,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.35))',
          padding: '8px 10px',
        }}
      >
        <div className="lp-mono" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)' }}>
          {fmtDate(day.date)}
        </div>
        <div style={{ marginTop: 2, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
          {labelForDayType(day.dayType) || 'Day'}
          {day.venue ? ` · ${day.venue}${day.city ? ` — ${day.city}` : ''}` : day.city ? ` · ${day.city}` : ''}
        </div>
        {day.advanceState ? (
          <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: ADVANCE_DOT[day.advanceState] }} />
            {ADVANCE_LABEL[day.advanceState]}
          </div>
        ) : null}
      </div>
      {/* Tail — a rotated square poking toward the tick; direction flips with
          placement (down when above the tick, up when flipped below it). */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: anchorX - 4,
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
