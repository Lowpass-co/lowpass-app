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

export function TourPicker({ tours }: { tours: HomeTourSummary[] }) {
  const router = useRouter();
  const { openCreateTour } = useTourEditor();
  const { selectedTourId, setSelectedTourId } = useArtistTourContext();
  const selected = tours.find((t) => t.id === selectedTourId) ?? null;

  const openTour = (id: string) => {
    setSelectedTourId(id);
    // Nav & entry fixpack item 1 — open on the tour's last-used product
    // (Operations fallback) instead of hardwiring Budget.
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

      <div
        className="mt-4 grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))' }}
      >
        {tours.map((t) => (
          <TourCard key={t.id} tour={t} onPick={() => openTour(t.id)} />
        ))}
      </div>
    </section>
  );
}

function TourCard({
  tour,
  onPick,
}: {
  tour: HomeTourSummary;
  onPick: () => void;
}) {
  const meta = statusMeta(tour.status);
  const activity = lastActivity(tour);
  // Design pass §7 · fingerprint mount #2 — highlight the next upcoming
  // show/festival day so the tick reads at a glance.
  const todayIso = new Date().toISOString().slice(0, 10);
  const highlightDate =
    tour.fingerprint.find((d) => {
      const first = d.dayType.split(',')[0]?.trim().toLowerCase();
      return (first === 'show' || first === 'festival') && d.date >= todayIso;
    })?.date ?? null;
  return (
    // Nav ruling — the card is a <div>, not a <button>: the fingerprint's day
    // ticks are <button>s and nesting buttons is invalid HTML. An absolute-fill
    // <button> is the click target (preserving onPick → openTour →
    // setSelectedTourId + product-bar unlock); the fingerprint sits above it
    // with its own pointer events so day-clicks don't trigger the card.
    <div
      className="group btn-transition relative overflow-hidden rounded-lg border p-4"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg-deep)',
      }}
    >
      {/* absolute-fill click target — the whole card selects the tour */}
      <button
        type="button"
        onClick={onPick}
        aria-label={`Open ${tour.name}`}
        className="absolute inset-0 z-0 cursor-pointer outline-none active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-inset"
        style={{ background: 'transparent', border: 0 }}
      />
      {/* status accent stripe */}
      <span
        aria-hidden
        className="absolute left-0 top-0 z-[1] h-full"
        style={{ width: 3, background: meta.color }}
      />
      {/* text content — pointer-events:none so clicks fall through to the
          overlay button underneath */}
      <div className="pointer-events-none relative z-[1]">
        <div className="flex items-start justify-between gap-2 pl-1.5">
          <span
            className="min-w-0 truncate"
            style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}
          >
            {tour.name}
          </span>
          <ChevronRight
            size={16}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: 'var(--color-lp-orange)' }}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-2 pl-1.5">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5"
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
          <span style={{ fontSize: 12, color: 'var(--lp-text-secondary)' }}>
            {fmtRange(tour.startDate, tour.endDate)}
          </span>
        </div>
        <div
          className="mt-3 flex items-center gap-3 pl-1.5"
          style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}
        >
          <span>
            <span className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>
              {tour.showCount}
            </span>{' '}
            {tour.showCount === 1 ? 'show' : 'shows'}
          </span>
          {activity ? (
            <>
              <span aria-hidden>·</span>
              <span>{activity}</span>
            </>
          ) : null}
        </div>
      </div>
      {/* row-scale tour fingerprint (mount #2) — its own pointer events sit
          above the overlay so day-ticks open their popover without selecting
          the tour. */}
      {tour.fingerprint.length > 0 ? (
        <div className="pointer-events-auto relative z-[2] mt-3 pl-1.5">
          <TourFingerprint
            days={tour.fingerprint}
            size="row"
            weekMarkers
            highlightDate={highlightDate}
            ariaLabel={`${tour.name} day strip`}
          />
        </div>
      ) : null}
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
