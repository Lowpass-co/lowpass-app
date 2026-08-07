/* ============================================
   LOWPASS — <RoutingRail> (shared days-on-the-left rail)

   ONE rail for every surface that indexes by tour day — Advance, Rooming
   (×3 views), and later the export/daysheet builder. Renders the vertical
   list ONLY (date · city/venue · day-type pill, selected highlight, optional
   week grouping). The caller owns the surrounding chrome (width, search,
   headers, scroll container) and pre-filters `entries` (e.g. Advance passes
   show days only).

   Selection is caller-controlled: pass `selected` + `onSelect`. For surfaces
   that navigate (Advance), pass `hrefForEntry` and the rail renders a <Link>;
   otherwise it renders a <button> that calls `onSelect` (Rooming, state-driven).

   RailEntry is TOUR-LEVEL (one row per routing.id). Per-person day-type
   overrides (e.g. a tech's extra de-prep day) and budget-line generation are
   coming, but they layer at the DATA level — the caller resolves the effective
   day per person and passes it in `dayType`. The rail stays presentational, so
   nothing here precludes that; do NOT bake person logic into the rail.

   Tokens only. Day-type pill colours come from src/lib/routing/dayType.ts
   (var(--lp-day-*)). Week grouping reuses src/lib/routing/week.ts.
   ============================================ */

'use client';

import Link from 'next/link';
import { useSpineNavigate } from '@/lib/nav/viewTransitionNav';
import { parseRoutingDate } from '@/lib/utils';
import { colourForDayType, labelForDayType } from '@/lib/routing/dayType';
import { getWeekStart, formatWeekLabel } from '@/lib/routing/week';

/** One day in the rail. Derived from the real `routing` table (no invented columns). */
export interface RailEntry {
  /** routing.id — the stable selection key on every surface. */
  id: string;
  /** routing.date — 'YYYY-MM-DD'. */
  date: string;
  /** routing.city. */
  city?: string | null;
  /** routing.venue_name (denormalised). */
  venueName?: string | null;
  /** routing.day_type — free TEXT, CSV-capable ("show,festival"), may be custom. */
  dayType?: string | null;
  /** Reserved — desirable later (Daysheets shows it). NOT wired in this build. */
  weather?: never;
}

export interface RoutingRailProps {
  entries: RailEntry[];
  /** Currently-selected routing.id (or null). */
  selected: string | null;
  /** Fired with the entry's id on click. Caller decides nav vs setState. */
  onSelect: (id: string) => void;
  /** 'night' (flat, default) or 'week' (Monday ISO buckets with WC headers). */
  grouping?: 'night' | 'week';
  /** When set, entries render as <Link href={hrefForEntry(e)}> (prefetched nav). */
  hrefForEntry?: (entry: RailEntry) => string;
  /** Optional trailing slot per entry (e.g. Advance progress bar + overdue badge). */
  renderMeta?: (entry: RailEntry) => React.ReactNode;
  /** Show the date · city/venue · day-type PILL. Default true; Advance passes false. */
  showDayTypePill?: boolean;
  ariaLabel?: string;
  /** R5-3 — opt-in `view-transition-name` for the spine morph (ledger → rail).
   *  OPT-IN on purpose: a view-transition-name must be UNIQUE in the document, so
   *  a surface that could ever mount two rails at once must not set it. Only the
   *  spine destinations (Advance sidebar, Day rail) pass it, matching the name the
   *  routing ledger puts on its own container. */
  viewTransitionName?: string;
}

function dateLabel(date: string): string {
  const d = parseRoutingDate(date);
  if (Number.isNaN(d.getTime())) return date;
  return d
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
}

function DayTypePill({ dayType }: { dayType: string }) {
  const colour = colourForDayType(dayType);
  const label = labelForDayType(dayType) || dayType;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 6,
        padding: '1px 7px',
        borderRadius: 'var(--lp-radius-full)',
        fontSize: '11px',
        fontWeight: 600,
        background: `color-mix(in srgb, ${colour} 14%, transparent)`,
        color: colour,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colour }} aria-hidden />
      {label}
    </span>
  );
}

/** The single-night cell — date · venue/city · day-type pill (+ optional meta).
 *  Shared so other surfaces (e.g. the Rooming matrix) render an IDENTICAL night
 *  cell as a grid row-header without embedding RoutingRail's <ul>. (D1.) */
export function RailNightCell({
  entry,
  active = false,
  showDayTypePill = true,
  renderMeta,
}: {
  entry: RailEntry;
  active?: boolean;
  showDayTypePill?: boolean;
  renderMeta?: (entry: RailEntry) => React.ReactNode;
}) {
  const primary = entry.venueName || entry.city || '—';
  // Show city as a second line only when it's distinct from the primary
  // (i.e. a venue name is present) — avoids a duplicated city line.
  const secondaryCity = entry.venueName ? entry.city : '';
  const dt = (entry.dayType ?? '').trim();
  return (
    <>
      <div
        className="lp-mono"
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: active ? 'var(--lp-orange)' : 'var(--lp-text-secondary)',
        }}
      >
        {dateLabel(entry.date)}
      </div>
      <div
        className="mt-0.5 truncate"
        style={{ fontSize: '13px', fontWeight: 500, color: 'var(--lp-text)' }}
      >
        {primary}
      </div>
      {secondaryCity ? (
        <div className="truncate" style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>
          {secondaryCity}
        </div>
      ) : null}
      {showDayTypePill && dt ? <DayTypePill dayType={dt} /> : null}
      {renderMeta ? renderMeta(entry) : null}
    </>
  );
}

export function RoutingRail({
  entries,
  selected,
  onSelect,
  grouping = 'night',
  hrefForEntry,
  renderMeta,
  showDayTypePill = true,
  ariaLabel = 'Tour days',
  viewTransitionName,
}: RoutingRailProps) {
  const spineNavigate = useSpineNavigate();
  const renderEntry = (entry: RailEntry) => {
    const active = entry.id === selected;
    const blockStyle: React.CSSProperties = {
      borderLeft: active ? '2px solid var(--lp-orange)' : '2px solid transparent',
      background: active ? 'var(--lp-surface)' : 'transparent',
    };
    const inner = (
      <RailNightCell
        entry={entry}
        active={active}
        showDayTypePill={showDayTypePill}
        renderMeta={renderMeta}
      />
    );
    return (
      <li key={entry.id}>
        {hrefForEntry ? (
          <Link
            href={hrefForEntry(entry)}
            className="btn-transition block px-3 py-2"
            style={blockStyle}
            aria-current={active ? 'true' : undefined}
            /* R5-3 completion — rail-entry hops morph the spine. Plain-click
               only; modified clicks keep native new-tab behaviour. Link stays
               for prefetch + a11y. */
            onClick={(e) => {
              onSelect(entry.id);
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                spineNavigate(hrefForEntry(entry));
              }
            }}
          >
            {inner}
          </Link>
        ) : (
          <button
            type="button"
            className="btn-transition block px-3 py-2"
            style={{ ...blockStyle, width: '100%', textAlign: 'left', border: 0, borderLeftWidth: 2, borderLeftStyle: 'solid', cursor: 'pointer' }}
            aria-current={active ? 'true' : undefined}
            aria-pressed={active}
            onClick={() => onSelect(entry.id)}
          >
            {inner}
          </button>
        )}
      </li>
    );
  };

  if (grouping === 'week') {
    // Preserve incoming order; bucket consecutively by Monday ISO week.
    const groups: { week: string; items: RailEntry[] }[] = [];
    for (const e of entries) {
      const ws = getWeekStart(e.date);
      const last = groups[groups.length - 1];
      if (last && last.week === ws) last.items.push(e);
      else groups.push({ week: ws, items: [e] });
    }
    return (
      <nav aria-label={ariaLabel} style={viewTransitionName ? { viewTransitionName } : undefined}>
        {groups.map((g) => (
          <div key={g.week}>
            <div
              className="px-3 py-1.5"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
                position: 'sticky',
                top: 0,
                background: 'var(--lp-bg-deep)',
                zIndex: 1,
              }}
            >
              {formatWeekLabel(g.week)}
            </div>
            <ul className="space-y-px">{g.items.map(renderEntry)}</ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={ariaLabel} style={viewTransitionName ? { viewTransitionName } : undefined}>
      <ul className="space-y-px">{entries.map(renderEntry)}</ul>
    </nav>
  );
}
