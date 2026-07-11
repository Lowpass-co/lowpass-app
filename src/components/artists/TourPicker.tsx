'use client';

/* ============================================
   LOWPASS — TourPicker (IA tour-flow fix §3)

   The artist-home tour-selection surface. Two states, driven by
   ArtistTourContext.selectedTourId (scoped to THIS artist's tours so a
   stale cross-artist selection falls back to the picker):

   - no tour selected → a hero callout + a grid of selectable tour cards
     (status, dates, show count, last activity). Picking one selects it
     and opens its last-used product (see openTour) — and unlocks the
     product bar above.
   - a tour selected → a compact "Active tour" banner with per-product
     quick links + a "Change tour" affordance that re-opens the picker.

   Design language follows the UI/UX skill: clear empty-state CTA,
   status-coloured accent, hover lift + active:scale press feedback,
   brand-orange active treatment. Adaptive via --lp tokens.

   Never auto-selects — selection is always an explicit click.
   ============================================ */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, DollarSign, ClipboardList, ChevronRight } from 'lucide-react';
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

export function TourPicker({ tours }: { tours: HomeTourSummary[] }) {
  const router = useRouter();
  const { openCreateTour } = useTourEditor();
  const { selectedTourId, setSelectedTourId } = useArtistTourContext();
  const selected = tours.find((t) => t.id === selectedTourId) ?? null;

  const openTour = (id: string) => {
    // Q4 — a row click NAVIGATES IN to the tour's last-used product (Operations
    // fallback) rather than selecting it in place on the artist page. We do NOT
    // setSelectedTourId here: ArtistTourContext derives selectedTourId from the
    // destination path (/operations|/budget|/advance/[id]), so the breadcrumb +
    // every product-route consumer still resolve — and calling the setter would
    // only race the push (see ArtistTourSwitcher.handleTourClick).
    router.push(tourHref(id));
  };

  if (selected) {
    return <ActiveTourBanner tour={selected} onChange={() => setSelectedTourId(null)} />;
  }

  if (tours.length === 0) {
    return (
      <section
        className="rounded-xl border p-6 text-center"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
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

  return (
    <section
      className="relative overflow-hidden rounded-xl border p-5 sm:p-6"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-lp-orange) 35%, var(--lp-border-strong))',
        background:
          'color-mix(in srgb, var(--color-lp-orange) 3.5%, var(--lp-surface))',
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="lp-h3" style={{ margin: 0 }}>
          Pick a tour to get started
        </h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {tours.length} {tours.length === 1 ? 'tour' : 'tours'}
        </span>
      </div>
      <p
        className="mt-1"
        style={{ fontSize: 14, color: 'var(--lp-text-secondary)' }}
      >
        Operations, Budget, and Advance all work on a specific tour. Choose
        one to unlock Operations, Budget and Advance in the bar above.
      </p>

      {(() => {
        // VIS-AR-02 — non-past tours: equal weight, date-ordered (start asc).
        // Past tours: collapse to one settled line each, most-recent first.
        const cmpAsc = (a: HomeTourSummary, b: HomeTourSummary) => {
          const av = a.startDate ?? a.endDate ?? '9999';
          const bv = b.startDate ?? b.endDate ?? '9999';
          return av < bv ? -1 : av > bv ? 1 : 0;
        };
        const cmpDesc = (a: HomeTourSummary, b: HomeTourSummary) => {
          const av = a.endDate ?? a.startDate ?? '0000';
          const bv = b.endDate ?? b.startDate ?? '0000';
          return av > bv ? -1 : av < bv ? 1 : 0;
        };
        const upcoming = tours.filter((t) => !isPastTour(t)).sort(cmpAsc);
        const past = tours.filter(isPastTour).sort(cmpDesc);
        return (
          <>
            <div className="mt-4 flex flex-col">
              {upcoming.length === 0 ? (
                <p
                  className="py-3"
                  style={{ fontSize: 13, color: 'var(--lp-text-tertiary)' }}
                >
                  No current or upcoming tours — past tours are listed below.
                </p>
              ) : (
                upcoming.map((t, i) => (
                  <TourRow
                    key={t.id}
                    tour={t}
                    first={i === 0}
                    onPick={() => openTour(t.id)}
                  />
                ))
              )}
            </div>

            {past.length > 0 ? (
              <div className="mt-5">
                <div
                  className="lp-label-caps"
                  style={{
                    color: 'var(--lp-text-tertiary)',
                    marginBottom: 'var(--lp-space-1)',
                  }}
                >
                  Past
                  <span
                    aria-hidden
                    style={{ margin: '0 var(--lp-space-2)', color: 'var(--lp-text-tertiary)' }}
                  >
                    ·
                  </span>
                  <span className="lp-mono">{past.length}</span>
                </div>
                <div className="flex flex-col">
                  {past.map((t, i) => (
                    <PastTourLine
                      key={t.id}
                      tour={t}
                      first={i === 0}
                      onPick={() => openTour(t.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        );
      })()}
    </section>
  );
}

/* VIS-AR-03 — tour ROW (replaces the card grid): name / dates /
   <TourFingerprint size="row"> / one status line. No readiness chips.

   Nav ruling (preserved): the row is a <div>, not a <button> — the
   fingerprint's day ticks are <button>s and nesting buttons is invalid HTML.
   An absolute-fill <button> is the click target (onPick → openTour →
   setSelectedTourId + product-bar unlock); the fingerprint sits above it with
   its own pointer events so day-clicks open their popover without selecting
   the tour. */
function TourRow({
  tour,
  first,
  onPick,
}: {
  tour: HomeTourSummary;
  first: boolean;
  onPick: () => void;
}) {
  const meta = statusMeta(tour.status);
  const highlightDate = nextShowDate(tour);
  return (
    <div
      className="group btn-transition relative flex items-center gap-4 py-3.5 pl-2 pr-1"
      style={{ borderTop: first ? 'none' : '1px solid var(--lp-border-subtle)' }}
    >
      {/* absolute-fill click target — selects the tour in place */}
      <button
        type="button"
        onClick={onPick}
        aria-label={`Open ${tour.name}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-inset"
        style={{ background: 'transparent', border: 0 }}
      />
      {/* status accent tick */}
      <span
        aria-hidden
        className="relative z-[1] shrink-0 self-stretch"
        style={{ width: 3, borderRadius: 2, background: meta.color }}
      />
      {/* identity — name + status + dates + one status line. pointer-events
          off so clicks fall through to the overlay. */}
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

/* VIS-AR-02 — past tour collapsed to one settled line (de-emphasised,
   still selectable to reopen). */
function PastTourLine({
  tour,
  first,
  onPick,
}: {
  tour: HomeTourSummary;
  first: boolean;
  onPick: () => void;
}) {
  return (
    <div
      className="group btn-transition relative flex items-center justify-between gap-3 py-2 pl-2 pr-1"
      style={{ borderTop: first ? 'none' : '1px solid var(--lp-border-subtle)' }}
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={`Open ${tour.name}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-inset"
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
        className="pointer-events-none relative z-[1] shrink-0"
        style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}
      >
        <span className="lp-mono">{tour.showCount}</span>{' '}
        {tour.showCount === 1 ? 'show' : 'shows'} · wrapped
      </span>
    </div>
  );
}

function ActiveTourBanner({
  tour,
  onChange,
}: {
  tour: HomeTourSummary;
  onChange: () => void;
}) {
  const meta = statusMeta(tour.status);
  const quick = [
    { label: 'Operations', href: `/operations/${tour.id}`, Icon: Briefcase },
    { label: 'Budget', href: `/budget/${tour.id}`, Icon: DollarSign },
    { label: 'Advance', href: `/advance/${tour.id}`, Icon: ClipboardList },
  ];
  return (
    <section
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-5 py-3.5"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-lp-orange) 35%, var(--lp-border-strong))',
        background: 'color-mix(in srgb, var(--color-lp-orange) 5%, var(--lp-surface))',
      }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <div className="min-w-0">
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          Active tour
        </div>
        <div
          className="truncate"
          style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}
        >
          {tour.name}
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {quick.map(({ label, href, Icon }) => (
          <Link
            key={label}
            href={href}
            className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5"
            style={{
              borderColor: 'var(--lp-border-strong)',
              background: 'var(--lp-bg)',
              color: 'var(--lp-text-secondary)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Icon size={13} />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={onChange}
          className="btn-transition rounded-md px-2.5 py-1.5"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-lp-orange)',
            background: 'transparent',
          }}
        >
          Change tour
        </button>
      </div>
    </section>
  );
}
