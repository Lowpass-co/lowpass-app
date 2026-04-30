/* ============================================
   LOWPASS — Tour Phase Context strip (Phase A budget redesign)

   Horizontal phase row pinned just below the TourBreadcrumb on the
   budget page. Each segment shows phase name + auto-computed date
   range; the current phase is highlighted with a 2px brand-orange
   border and a 8% orange-tinted background.

   Click a segment to filter the budget table to lines whose date
   falls within that phase. Filter wiring is owned by the parent —
   this component just emits onPhaseChange(key | null).

       [ PRE-PROD ] [ REHEARSALS ] [ SHOW DAYS ·  Current ] [ WRAP ]
        Jan 1-Feb 15  Feb 16-Mar 10   Mar 11-May 22         May 23-Jun 5

   Print stylesheet hides it (chrome, not content).
   ============================================ */

'use client';

import type { TourPhase, TourPhaseKey } from '@/server/budget/computeTourPhases';

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  if (startIso === endIso) {
    return start.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sm = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const em = end.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
  return `${sm} – ${em}`;
}

export type TourPhaseContextStripProps = {
  phases: TourPhase[];
  /** null = no filter (all phases). */
  activePhaseKey: TourPhaseKey | null;
  onPhaseChange: (key: TourPhaseKey | null) => void;
  /**
   * When true, the strip pins itself below the TourBreadcrumb via
   * `position: sticky; top: var(--lp-space-12)`. The default in the
   * budget page is true; in standalone preview / docs surfaces a
   * non-sticky render is the saner default.
   */
  sticky?: boolean;
};

export function TourPhaseContextStrip({
  phases,
  activePhaseKey,
  onPhaseChange,
  sticky = true,
}: TourPhaseContextStripProps) {
  if (phases.length === 0) return null;

  return (
    <div
      className="lp-tour-phase-strip print:hidden"
      style={{
        position: sticky ? 'sticky' : 'static',
        // 48px = the TourBreadcrumb's height; phase strip flushes
        // immediately below it.
        top: sticky ? 'var(--lp-space-12, 48px)' : undefined,
        zIndex: sticky ? 'var(--lp-z-sticky)' : undefined,
        background: 'color-mix(in srgb, var(--lp-bg) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--lp-border)',
        padding: 'var(--lp-space-3, 12px) 0',
        marginBottom: 'var(--lp-space-4, 16px)',
      }}
      aria-label="Tour phase context"
    >
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))`,
        }}
      >
        {phases.map((phase) => {
          const active = phase.key === activePhaseKey;
          const isCurrent = phase.isCurrent;
          const isPast = phase.isPast;
          const isFuture = !isPast && !isCurrent;
          const isPlaceholder = phase.isPlaceholder ?? false;

          // Visual state: active selection wins over isCurrent for
          // border + bg. isCurrent only highlights when nothing's
          // explicitly selected.
          const showAccent = active || (isCurrent && activePhaseKey === null);

          const labelColor = isPast
            ? 'var(--lp-text-tertiary)'
            : isFuture
              ? 'var(--lp-text-secondary)'
              : 'var(--lp-text)';

          return (
            <button
              key={phase.key}
              type="button"
              onClick={() => onPhaseChange(active ? null : phase.key)}
              className="btn-transition flex flex-col items-start gap-1 rounded-md px-3 py-2 text-left"
              style={{
                border: showAccent
                  ? '2px solid var(--color-lp-orange)'
                  : '1px solid var(--lp-border)',
                background: showAccent
                  ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
                  : 'var(--lp-surface)',
              }}
              aria-pressed={active}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className="inline-flex items-center gap-1.5 truncate"
                style={{
                  color: labelColor,
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  letterSpacing: 'var(--lp-tracking-caps)',
                  textTransform: 'uppercase',
                }}
              >
                {phase.label}
                {isCurrent ? (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: 'var(--color-lp-orange)' }}
                    title="Current phase"
                  />
                ) : null}
              </span>
              <span
                className="truncate text-xs"
                style={{ color: 'var(--lp-text-tertiary)' }}
              >
                {phase.startDate === phase.endDate && isPlaceholder
                  ? '—'
                  : formatRange(phase.startDate, phase.endDate)}
                {isPlaceholder ? ' · no shows scheduled' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
