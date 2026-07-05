/* ============================================
   LOWPASS — Sprint 7 §3 — <TourHeader>

   Strip mounted above the page body on every product surface
   (/budget/[X], /advance/[X]/[Y], /operations/[X]/...). Carries
   the tour's identity prominently so the operator never has to
   hunt for "which tour am I editing" — the switcher in the top-
   left is too subtle on its own.

   Layout (~96px tall):
     [60×60 LOGO]    ARTIST · {artist.name}
                     {tour.name}                              ← visual hero, 28px
                     {N} SHOWS · {date range} · {product stat} · ...
                                                          [Edit tour]

   Server component — pure presentation, no interactivity beyond
   the Edit button (which is a <Link>). All data + the resolved
   logo URL come from the page's server fetch via props.

   Animation: first-mount fade-in + translateY(-4px → 0) over
   200ms via the inner <TourHeaderAnimator> client island. The
   rest of the strip stays a server component.
   ============================================ */

import Link from 'next/link';
import { Pencil } from 'lucide-react';
import {
  TourHeaderAnimator,
  TourHeaderLogo,
} from './TourHeaderClient';

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
};

function abbreviateCurrency(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${Math.round(value / 1_000)}K`;
  return `${sym}${Math.round(value)}`;
}

function formatDateRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  function fmt(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return s === e ? s : `${s} → ${e}`;
  return s ?? e ?? null;
}

export interface TourHeaderProps {
  artistId: string;
  artistName: string;
  /** Pre-resolved through src/lib/artists/imageUrl.ts. Null
   *  means the consumer should render the initials chip. */
  artistLogoUrl: string | null;
  tourId: string;
  tourName: string;
  startDate: string | null;
  endDate: string | null;
  product: 'budget' | 'advance' | 'operations';
  /** Per-product stats. The component picks the relevant
   *  fields and formats them into the dot-separated micro-
   *  label row below the tour name. */
  stats: {
    showCount: number | null;
    /** Total dated routing days — rendered as "· N DAYS" after the show count
     *  so routing rows are never mislabelled "shows" (UX-walk §A.3). */
    dayCount?: number | null;
    // budget:
    budgetTotal?: number | null;
    budgetCurrency?: string | null;
    spentPercent?: number | null;
    // advance:
    advanceCompletePercent?: number | null;
    advancePendingCount?: number | null;
    // operations:
    crewCount?: number | null;
    legCount?: number | null;
  };
}

export function TourHeader({
  artistId,
  artistName,
  artistLogoUrl,
  tourId,
  tourName,
  startDate,
  endDate,
  product,
  stats,
}: TourHeaderProps) {
  const dateRange = formatDateRange(startDate, endDate);

  // Build the stats line — dot-separated, omit empty fields.
  const parts: string[] = [];
  if (stats.showCount != null && stats.showCount >= 0) {
    parts.push(`${stats.showCount} ${stats.showCount === 1 ? 'SHOW' : 'SHOWS'}`);
  }
  // UX-walk §A.3 — routing rows are days, not shows: show the day count too.
  if (stats.dayCount != null && stats.dayCount > 0 && stats.dayCount !== stats.showCount) {
    parts.push(`${stats.dayCount} ${stats.dayCount === 1 ? 'DAY' : 'DAYS'}`);
  }
  if (dateRange) parts.push(dateRange);

  if (product === 'budget') {
    if (stats.budgetTotal != null && stats.budgetTotal > 0) {
      parts.push(
        abbreviateCurrency(
          stats.budgetTotal,
          stats.budgetCurrency ?? 'GBP',
        ),
      );
    }
    if (stats.spentPercent != null) {
      parts.push(`${Math.round(stats.spentPercent)}% SPENT`);
    }
  } else if (product === 'advance') {
    if (stats.advanceCompletePercent != null) {
      parts.push(
        `${Math.round(stats.advanceCompletePercent)}% COMPLETE`,
      );
    }
    if (
      stats.advancePendingCount != null &&
      stats.advancePendingCount > 0
    ) {
      parts.push(`${stats.advancePendingCount} PENDING`);
    }
  } else {
    // operations
    if (stats.crewCount != null && stats.crewCount > 0) {
      parts.push(`${stats.crewCount} CREW`);
    }
    if (stats.legCount != null && stats.legCount > 0) {
      parts.push(`${stats.legCount} ${stats.legCount === 1 ? 'LEG' : 'LEGS'}`);
    }
  }

  const statsLine = parts.join(' · ');

  // Sprint 8 §2 compressed bar deleted (Sprint 8.1 §1) —
  // overlapped ProductRail and duplicated identity info from
  // the switcher. The keyStat third dot-segment briefly added
  // to the trigger in 8.1 §1 was also removed (Sprint 8.2 §1)
  // — Adam's smoke: "irrelevant". The expanded TourHeader's
  // statsLine row 3 below remains the canonical surface for
  // per-product progress numbers.

  return (
    <TourHeaderAnimator>
      <header
        className="lp-tour-header flex shrink-0 items-center"
        style={{
          gap: 'var(--lp-space-4)',
          padding: 'var(--lp-space-4) var(--lp-space-6)',
          minHeight: 96,
          background: 'var(--lp-panel)',
          borderBottom: '1px solid var(--lp-border-strong)',
        }}
        data-product={product}
        data-tour-id={tourId}
        data-artist-id={artistId}
      >
        {/* Logo — fallback chain handled server-side by
            resolveArtistLogoUrl; null falls through to the
            initials chip rendered inside the client island
            so the chip background can use --color-lp-orange
            without server vs client mismatches. */}
        <TourHeaderLogo
          imageUrl={artistLogoUrl}
          name={artistName}
        />

        {/* Text block — three rows, vertical stack. */}
        <div
          className="flex min-w-0 flex-1 flex-col"
          style={{ gap: 4 }}
        >
          {/* Row 1 — micro-label + artist name */}
          <div
            className="min-w-0 truncate"
            style={{
              fontSize: 'var(--lp-text-2xs)',
              fontWeight: 'var(--lp-weight-bold)',
              letterSpacing: 'var(--lp-tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            <span>Artist</span>
            <span style={{ margin: '0 var(--lp-space-2)' }}>·</span>
            <span style={{ color: 'var(--lp-text)' }}>
              {artistName}
            </span>
          </div>

          {/* Row 2 — tour name (visual hero) */}
          <h1
            className="min-w-0 truncate"
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
              lineHeight: 1.1,
            }}
          >
            {tourName}
          </h1>

          {/* Row 3 — stats line. Hidden when no parts populated. */}
          {statsLine ? (
            <div
              className="min-w-0 truncate"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: 'var(--lp-weight-medium)',
                letterSpacing: 'var(--lp-tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {statsLine}
            </div>
          ) : null}
        </div>

        {/* Right-side action — always visible per Adam's call.
            Links to the legacy edit page; full edit slide-over
            is deferred to a separate sprint. */}
        <Link
          href={`/operations/${tourId}/edit`}
          aria-label={`Edit ${tourName}`}
          className="btn-transition inline-flex shrink-0 items-center"
          style={{
            gap: 'var(--lp-space-2)',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text-secondary)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          <Pencil aria-hidden size={14} strokeWidth={2} />
          Edit tour
        </Link>
      </header>
    </TourHeaderAnimator>
  );
}
