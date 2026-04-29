'use client';

/* ============================================
   LOWPASS — Advance Show Context Bar (UX22 phase 2)

   Sticky context strip rendered as the first child of <DocumentCanvas
   mode="prose"> on per-show advance pages. Tells the operator at a
   glance which show they're editing as they scroll through long
   advance forms.

       [Artist avatar] Artist · Tour · Day · Date · Venue · City   [Progress 3/8]

   Identity is server-fetched and passed in as props (cheap, stable);
   the sections-progress chip is fetched client-side from the same
   /api/tours endpoint AdvanceShowReadView consumes so it tracks live
   updates as the user works through sections. Refetches on
   visibilitychange so a tab-switch returns to a fresh chip.

   Print stylesheet hides the bar — it's chrome, not content.
   ============================================ */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, MapPin, Music } from 'lucide-react';
import { cn, dayTypesInclude, getDayTypeLabel, parseRoutingDate } from '@/lib/utils';

const DAY_TYPE_TOKEN: Record<string, string> = {
  show: 'var(--color-lp-day-show)',
  festival: 'var(--color-lp-day-festival)',
  travel: 'var(--color-lp-day-travel)',
  off: 'var(--color-lp-day-off)',
  rehearsal: 'var(--color-lp-day-rehearsal)',
  press: 'var(--color-lp-day-press)',
  radio: 'var(--color-lp-day-radio)',
  tv: 'var(--color-lp-day-tv)',
};

function colourForDayType(dayTypeCsv: string | null | undefined): string {
  if (!dayTypeCsv) return DAY_TYPE_TOKEN.off;
  const first = dayTypeCsv.split(',')[0]?.trim().toLowerCase() ?? '';
  return DAY_TYPE_TOKEN[first] ?? DAY_TYPE_TOKEN.off;
}

function deriveInitials(nameOrEmail: string | null | undefined): string {
  const trimmed = (nameOrEmail ?? '').trim();
  if (!trimmed) return '?';
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

type AdvanceSectionStatus = { status: string };

type AdvanceBundle = {
  advance?: {
    sections?: Array<{ template_id?: string | null; label?: string | null }>;
    section_statuses?: Record<string, AdvanceSectionStatus>;
  } | null;
};

function computeProgress(bundle: AdvanceBundle | null): { complete: number; total: number } {
  const sections = bundle?.advance?.sections ?? [];
  const statuses = bundle?.advance?.section_statuses ?? {};
  let complete = 0;
  for (const sec of sections) {
    const key = sec.template_id ?? sec.label;
    if (!key) continue;
    if (statuses[key]?.status === 'complete') complete++;
  }
  return { complete, total: sections.length };
}

export type AdvanceShowContextBarProps = {
  tourId: string;
  routingId: string;
  artist: {
    id: string;
    name: string;
    /** Optional logo / image URL pulled from `artists.branding`. */
    imageUrl?: string | null;
  };
  tour: { id: string; name: string };
  show: {
    /** YYYY-MM-DD */
    date: string;
    /** Comma-separated day-type csv ("show", "show,press", etc.) */
    dayType: string | null;
    venueName: string | null;
    city: string | null;
  };
};

export function AdvanceShowContextBar({
  tourId,
  routingId,
  artist,
  tour,
  show,
}: AdvanceShowContextBarProps) {
  const [progress, setProgress] = useState<{ complete: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch(`/api/tours/${tourId}/advance/${routingId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: AdvanceBundle | null) => {
          if (!cancelled) setProgress(computeProgress(data));
        })
        .catch(() => {
          if (!cancelled) setProgress(null);
        });
    };
    load();
    // Tab returns to focus → re-pull so the chip is current after edits in
    // a sibling tab or after the AdvanceSectionBuilder saves.
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tourId, routingId]);

  const dayTypeColour = colourForDayType(show.dayType);
  const dayTypeLabel = show.dayType ? getDayTypeLabel(show.dayType) : null;
  const isShowDay =
    !!show.dayType &&
    (dayTypesInclude(show.dayType, 'show') || dayTypesInclude(show.dayType, 'festival'));
  const dateLabel = parseRoutingDate(show.date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const initials = deriveInitials(artist.name);

  const progressLabel = progress
    ? progress.total > 0
      ? `${progress.complete}/${progress.total}`
      : '0/0'
    : null;
  const progressPct = progress && progress.total > 0 ? (progress.complete / progress.total) * 100 : 0;

  return (
    <div
      className="advance-context-bar print:hidden"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--lp-z-sticky)',
        background: 'color-mix(in srgb, var(--lp-bg) 88%, transparent)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--lp-border)',
        // Negative top margin pulls the bar against the DocumentCanvas
        // prose container's top padding so it sticks at the actual scroll
        // surface edge, not 48px below it.
        marginTop: 'calc(-1 * var(--lp-space-12, 48px))',
        marginBottom: 'var(--lp-space-4, 16px)',
        padding: 'var(--lp-space-3, 12px) var(--lp-space-4, 16px)',
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Artist avatar */}
        <Link
          href={`/artists/${artist.id}`}
          className="flex shrink-0 items-center gap-2 rounded-full hover:opacity-80"
          aria-label={`Artist ${artist.name}`}
        >
          {artist.imageUrl ? (
            // Avatar image — falls back to initials chip if it 404s. Inline
            // <img> keeps the bar dependency-light; AccountAvatar uses
            // next/image which requires the supabase host in remotePatterns.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.imageUrl}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                background: 'var(--color-lp-orange)',
                color: 'var(--lp-text-inverse, #FFFFFF)',
              }}
            >
              {initials}
            </span>
          )}
          <span className="text-sm font-semibold text-lp-text">{artist.name}</span>
        </Link>

        <span aria-hidden className="text-lp-text-tertiary">
          ·
        </span>

        {/* Tour link */}
        <Link
          href={`/tours/${tour.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-lp-text-secondary hover:text-lp-text"
        >
          <Music className="h-3.5 w-3.5" aria-hidden />
          {tour.name}
        </Link>

        <span aria-hidden className="text-lp-text-tertiary">
          ·
        </span>

        {/* Day-type pill */}
        {dayTypeLabel ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              background: `color-mix(in srgb, ${dayTypeColour} 15%, transparent)`,
              color: dayTypeColour,
            }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: dayTypeColour }}
            />
            {dayTypeLabel}
          </span>
        ) : null}

        {/* Date */}
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-lp-text-secondary">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          {dateLabel}
        </span>

        {/* Venue · City */}
        {show.venueName || show.city ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm text-lp-text">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-lp-text-tertiary" aria-hidden />
            <span className="truncate font-medium">
              {show.venueName || show.city}
            </span>
            {show.venueName && show.city ? (
              <span className="truncate text-lp-text-tertiary">· {show.city}</span>
            ) : null}
          </span>
        ) : null}

        {/* Progress chip — right-aligned, only on show days where total > 0 */}
        {isShowDay && progress && progress.total > 0 ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
              color: 'var(--lp-text-secondary)',
            }}
            title={`${progress.complete} of ${progress.total} sections complete`}
          >
            <ProgressRing pct={progressPct} />
            <span className="tabular-nums">{progressLabel}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 16;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100;
  const dash = c * filled;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('-rotate-90')}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--lp-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-lp-status-complete)"
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
      />
    </svg>
  );
}
