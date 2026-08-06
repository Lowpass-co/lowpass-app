'use client';

/* ============================================
   LOWPASS — TourPicker (rebuild, 2026-08)

   The artist-home tour list. ONE state, always: a standard section
   (lp-label-caps header row + bordered lp-surface container) listing
   every tour. The old duality — orange hero callout vs. a collapsed
   "Active tour" banner driven by invisible ArtistTourContext state —
   is gone; whether you can see your tours no longer depends on
   context you can't see.

   - On-the-road / upcoming tours: full rows (name, status pill,
     date range, <TourFingerprint size="row">, one status line,
     visible Operations · Budget · Advance quick links), sorted
     start-date ascending.
   - Past tours: compact "PAST · N" group, most-recent first.
   - If ArtistTourContext.selectedTourId matches a row, that row gets
     the app's standard active treatment (2px orange left border +
     subtle surface tint) — it never hides the rest of the list.

   Navigation semantics (preserved from the previous version, Q4):
   a row click NAVIGATES IN via router.push(tourHref(id)) — the
   tour's last-used product with Operations fallback. We do NOT call
   setSelectedTourId here: ArtistTourContext derives selectedTourId
   from the destination path, and calling the setter would only race
   the push (see ArtistTourSwitcher.handleTourClick).

   Never auto-selects — opening a tour is always an explicit click.
   ============================================ */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useTourEditor } from '@/contexts/TourEditorContext';
import { tourHref } from '@/lib/nav/lastProduct';
import { TourFingerprint } from '@/components/tour/TourFingerprint';
import type { HomeTourSummary } from '@/server/home/getHomeData';

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'var(--color-lp-status-complete)' },
  planning: { label: 'Planning', color: 'var(--color-lp-status-needs-review)' },
  confirmed: { label: 'Confirmed', color: 'var(--color-lp-status-in-progress)' },
  completed: { label: 'Completed', color: 'var(--lp-text-tertiary)' },
  archived: { label: 'Archived', color: 'var(--lp-text-tertiary)' },
};

function statusMeta(status: string) {
  return (
    STATUS_META[status?.toLowerCase()] ?? {
      label: status || 'Tour',
      color: 'var(--lp-text-tertiary)',
    }
  );
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtRange(start: string | null, end: string | null): string {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || 'Dates TBC';
}

function lastActivity(t: HomeTourSummary): string | null {
  const stamps = [
    t.lastBudgetTouchedAt,
    t.lastAdvanceTouchedAt,
    t.lastOpsTouchedAt,
  ].filter(Boolean) as string[];
  if (stamps.length === 0) return null;
  const newest = stamps.sort().at(-1)!;
  const d = new Date(newest);
  if (Number.isNaN(d.getTime())) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 60) return 'active just now';
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `updated ${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `updated ${diffD}d ago`;
  return `updated ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
}

/** Relative day phrasing for the row status line (verb + time anchor, §8). */
function fmtRelativeDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const dayMs = 86_400_000;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((target - startOfToday) / dayMs);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 1 && diffDays <= 30) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -30) return `${Math.abs(diffDays)} days ago`;
  return fmtDate(iso) ?? '';
}

/** True when the tour has finished (end, or start when undated, is in the past). */
function isPastTour(t: HomeTourSummary): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const end = t.endDate?.slice(0, 10) ?? t.startDate?.slice(0, 10) ?? null;
  return !!end && end < today;
}

/** One status line per row — verb + time anchor (§8), no mood words. */
function tourStatusLine(t: HomeTourSummary): string {
  const today = new Date().toISOString().slice(0, 10);
  const start = t.startDate?.slice(0, 10) ?? null;
  const end = t.endDate?.slice(0, 10) ?? null;
  if (start && end && start <= today && today <= end) {
    return `On the road · ends ${fmtRelativeDay(end)}`;
  }
  if (start && start > today) return `Starts ${fmtRelativeDay(start)}`;
  if (end && end < today) return `Wrapped ${fmtRelativeDay(end)}`;
  return lastActivity(t) ?? 'Not scheduled yet';
}

/** Next upcoming show/festival day for the fingerprint highlight tick. */
function nextShowDate(t: HomeTourSummary): string | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    t.fingerprint.find((d) => {
      const first = d.dayType.split(',')[0]?.trim().toLowerCase();
      return (first === 'show' || first === 'festival') && d.date >= today;
    })?.date ?? null
  );
}

/** Current/upcoming tours: equal weight, date-ordered (start asc). */
function cmpStartAsc(a: HomeTourSummary, b: HomeTourSummary): number {
  const av = a.startDate ?? a.endDate ?? '9999';
  const bv = b.startDate ?? b.endDate ?? '9999';
  return av < bv ? -1 : av > bv ? 1 : 0;
}

/** Past tours: most-recently-wrapped first. */
function cmpEndDesc(a: HomeTourSummary, b: HomeTourSummary): number {
  const av = a.endDate ?? a.startDate ?? '0000';
  const bv = b.endDate ?? b.startDate ?? '0000';
  return av > bv ? -1 : av < bv ? 1 : 0;
}

/** Per-row product quick links — visible, not hover-only. */
const QUICK_LINKS: Array<{ label: string; href: (id: string) => string }> = [
  { label: 'Operations', href: (id) => `/operations/${id}/routing` },
  { label: 'Budget', href: (id) => `/budget/${id}` },
  { label: 'Advance', href: (id) => `/advance/${id}` },
];

export function TourPicker({ tours }: { tours: HomeTourSummary[] }) {
  const router = useRouter();
  const { openCreateTour } = useTourEditor();
  const { selectedTourId } = useArtistTourContext();
  // Scoped to THIS artist's tours so a stale cross-artist selection
  // highlights nothing rather than something wrong.
  const activeTourId = tours.some((t) => t.id === selectedTourId)
    ? selectedTourId
    : null;

  const openTour = (id: string) => {
    // Q4 — a row click NAVIGATES IN to the tour's last-used product
    // (Operations fallback). No setSelectedTourId: context derives the
    // selection from the destination path (see header comment).
    router.push(tourHref(id));
  };

  if (tours.length === 0) {
    return (
      <section
        className="text-center"
        style={{
          padding: 'var(--lp-space-6)',
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-lg)',
        }}
      >
        <h2 className="lp-h3" style={{ margin: 0 }}>
          No tours yet
        </h2>
        <p
          className="mt-1.5"
          style={{ fontSize: 14, color: 'var(--lp-text-secondary)' }}
        >
          Create a tour to open Operations, Budget, and Advance for it.
        </p>
        <button
          type="button"
          onClick={() => openCreateTour()}
          className="btn-transition mt-4 inline-flex items-center gap-1.5 rounded-md px-3.5 py-2"
          style={{
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--color-lp-orange)',
            color: 'var(--lp-text-inverse, #fff)',
          }}
        >
          Create a tour →
        </button>
      </section>
    );
  }

  const upcoming = tours.filter((t) => !isPastTour(t)).sort(cmpStartAsc);
  const past = tours.filter(isPastTour).sort(cmpEndDesc);

  return (
    <section className="space-y-2">
      {/* Section header — standard workspace-landing grammar:
          caps label + mono count left, compact action right. */}
      <div className="flex items-baseline justify-between">
        <h2
          className="lp-label-caps"
          style={{ margin: 0, color: 'var(--lp-text-tertiary)' }}
        >
          Tours
          <span aria-hidden style={{ margin: '0 var(--lp-space-2)' }}>
            ·
          </span>
          <span className="lp-mono">{tours.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => openCreateTour()}
          className="btn-transition inline-flex items-center rounded-md px-2.5 py-1"
          style={{
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-lp-orange)',
            background: 'transparent',
            border: '1px solid var(--lp-border-strong)',
          }}
        >
          + New tour
        </button>
      </div>

      {/* Plain bordered surface container — the tour list, always visible. */}
      <div
        className="overflow-hidden"
        style={{
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-lg)',
        }}
      >
        <div className="flex flex-col">
          {upcoming.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: 'var(--lp-space-3) var(--lp-space-4)',
                fontSize: 13,
                color: 'var(--lp-text-tertiary)',
              }}
            >
              No current or upcoming tours — past tours are listed below.
            </p>
          ) : (
            upcoming.map((t, i) => (
              <TourRow
                key={t.id}
                tour={t}
                first={i === 0}
                active={t.id === activeTourId}
                onPick={() => openTour(t.id)}
              />
            ))
          )}
        </div>

        {past.length > 0 ? (
          <div style={{ borderTop: '1px solid var(--lp-border-subtle)' }}>
            <div
              className="lp-label-caps"
              style={{
                padding:
                  'var(--lp-space-2) var(--lp-space-4) var(--lp-space-1)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Past
              <span aria-hidden style={{ margin: '0 var(--lp-space-2)' }}>
                ·
              </span>
              <span className="lp-mono">{past.length}</span>
            </div>
            <div className="flex flex-col">
              {past.map((t) => (
                <PastTourLine
                  key={t.id}
                  tour={t}
                  active={t.id === activeTourId}
                  onPick={() => openTour(t.id)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* Visible per-row product quick links (Operations · Budget · Advance) —
   small-uppercase-link style, dot-separated. Sits ABOVE the row's
   absolute-fill click target so each link navigates directly without
   triggering the row's openTour. */
function QuickLinks({ tourId, tourName }: { tourId: string; tourName: string }) {
  return (
    <span
      className="pointer-events-auto relative z-[2] inline-flex shrink-0 items-center"
      style={{ gap: 'var(--lp-space-1)' }}
    >
      {QUICK_LINKS.map(({ label, href }, i) => (
        <span key={label} className="inline-flex items-center" style={{ gap: 'var(--lp-space-1)' }}>
          {i > 0 ? (
            <span aria-hidden style={{ color: 'var(--lp-text-tertiary)', fontSize: 10 }}>
              ·
            </span>
          ) : null}
          <Link
            href={href(tourId)}
            aria-label={`${label} — ${tourName}`}
            className="btn-transition rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)]"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--lp-text-secondary)',
            }}
          >
            {label}
          </Link>
        </span>
      ))}
    </span>
  );
}

/* Tour ROW: name / status pill / dates / <TourFingerprint size="row"> /
   one status line / visible quick links.

   Nav ruling (preserved): the row is a <div>, not a <button> — the
   fingerprint's day ticks are <button>s and nesting buttons is invalid HTML.
   An absolute-fill <button> is the click target (onPick → openTour); the
   fingerprint and quick links sit above it with their own pointer events.

   Active treatment (standard app grammar): 2px orange left border + subtle
   surface tint when this row is the context-selected tour. Every row carries
   a transparent 2px left border so activation never shifts layout. */
function TourRow({
  tour,
  first,
  active,
  onPick,
}: {
  tour: HomeTourSummary;
  first: boolean;
  active: boolean;
  onPick: () => void;
}) {
  const meta = statusMeta(tour.status);
  const highlightDate = nextShowDate(tour);
  return (
    <div
      className="group btn-transition relative flex items-center gap-4 py-3.5 pl-3 pr-3"
      style={{
        borderTop: first ? 'none' : '1px solid var(--lp-border-subtle)',
        borderLeft: active
          ? '2px solid var(--lp-orange)'
          : '2px solid transparent',
        background: active
          ? 'color-mix(in srgb, var(--lp-orange) 4%, transparent)'
          : 'transparent',
      }}
    >
      {/* absolute-fill click target — opens the tour */}
      <button
        type="button"
        onClick={onPick}
        aria-label={`Open ${tour.name}`}
        aria-current={active ? 'true' : undefined}
        className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-inset"
        style={{ background: 'transparent', border: 0 }}
      />
      {/* status accent tick */}
      <span
        aria-hidden
        className="relative z-[1] shrink-0 self-stretch"
        style={{ width: 3, borderRadius: 2, background: meta.color }}
      />
      {/* identity — name + status + dates + one status line + quick links.
          pointer-events off so clicks fall through to the overlay; the
          quick links re-enable their own. */}
      <div
        className="pointer-events-none relative z-[1] min-w-0"
        style={{ flex: '0 1 300px' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 truncate"
            style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}
          >
            {tour.name}
          </span>
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: meta.color,
              background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
            }}
          >
            {meta.label}
          </span>
        </div>
        <div
          className="mt-1 truncate"
          style={{ fontSize: 12, color: 'var(--lp-text-secondary)' }}
        >
          {fmtRange(tour.startDate, tour.endDate)}
        </div>
        <div
          className="mt-0.5 truncate"
          style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}
        >
          {tourStatusLine(tour)}
        </div>
        <div className="mt-1.5">
          <QuickLinks tourId={tour.id} tourName={tour.name} />
        </div>
      </div>
      {/* fingerprint — its own pointer events sit above the overlay */}
      <div className="pointer-events-auto relative z-[2] min-w-0 flex-1">
        {tour.fingerprint.length > 0 ? (
          <TourFingerprint
            days={tour.fingerprint}
            size="row"
            weekMarkers
            highlightDate={highlightDate}
            ariaLabel={`${tour.name} day strip`}
          />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
            No dates yet
          </span>
        )}
      </div>
      <ChevronRight
        size={16}
        aria-hidden
        className="pointer-events-none relative z-[1] shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--color-lp-orange)' }}
      />
    </div>
  );
}

/* Past tour collapsed to one settled line — de-emphasised, still openable,
   same quick links so a wrapped tour's products stay one click away. */
function PastTourLine({
  tour,
  active,
  onPick,
}: {
  tour: HomeTourSummary;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <div
      className="group btn-transition relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 pl-3 pr-3"
      style={{
        borderTop: '1px solid var(--lp-border-subtle)',
        borderLeft: active
          ? '2px solid var(--lp-orange)'
          : '2px solid transparent',
        background: active
          ? 'color-mix(in srgb, var(--lp-orange) 4%, transparent)'
          : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={`Open ${tour.name}`}
        aria-current={active ? 'true' : undefined}
        className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-inset"
        style={{ background: 'transparent', border: 0 }}
      />
      <span
        className="pointer-events-none relative z-[1] min-w-0 truncate"
        style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}
      >
        {tour.name}
        <span style={{ color: 'var(--lp-text-tertiary)' }}>
          {' · '}
          {fmtRange(tour.startDate, tour.endDate)}
        </span>
      </span>
      <span
        className="relative z-[1] flex shrink-0 items-center"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <QuickLinks tourId={tour.id} tourName={tour.name} />
        <span
          className="pointer-events-none"
          style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}
        >
          <span className="lp-mono">{tour.showCount}</span>{' '}
          {tour.showCount === 1 ? 'show' : 'shows'} · wrapped
        </span>
      </span>
    </div>
  );
}
