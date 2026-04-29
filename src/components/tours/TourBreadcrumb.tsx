/* ============================================
   LOWPASS — Tour Breadcrumb (Phase D nav redesign)

   Persistent breadcrumb strip rendered at the top of every
   tour-internal page (Advance, Budget, Routing, Channel list,
   Rooming, Payroll, Rider packs, Files, Hire, Personnel, etc.).

       [← Artist › Tour › Page]                  [Back to tour]

   Sticky to the top of <main>'s scroll container — sits flush
   under the TopBar as the user scrolls. The page name is derived
   from the URL pathname; segments are clickable except the
   current page.

   Print stylesheet hides the bar (it's chrome, not content).
   ============================================ */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';

const PAGE_LABELS: Record<string, string> = {
  advance: 'Advance',
  budget: 'Budget',
  'channel-list': 'Channel list',
  day: 'Day',
  edit: 'Settings',
  files: 'Files',
  hire: 'Hire',
  overview: 'Overview',
  payroll: 'Payroll',
  personnel: 'Personnel',
  'rider-packs': 'Rider Packs',
  rooming: 'Rooming',
  routing: 'Routing',
  sheet: 'Sheet',
  summary: 'Summary',
  'tour-wide': 'Tour-wide',
};

function humanize(slug: string): string {
  if (!slug) return '';
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function derivePageLabel(pathname: string, tourId: string): string | null {
  const prefix = `/tours/${tourId}`;
  if (!pathname.startsWith(prefix)) return null;
  // The hub itself doesn't get a breadcrumb — it has its own
  // "← Artist" back link in the page body.
  if (pathname === prefix || pathname === `${prefix}/`) return null;
  const rest = pathname.slice(prefix.length).split('/').filter(Boolean);
  const seg = rest[0] ?? '';
  if (!seg) return null;
  return PAGE_LABELS[seg] ?? humanize(seg);
}

export type TourBreadcrumbProps = {
  artistId: string;
  artistName: string;
  tourId: string;
  tourName: string;
};

export function TourBreadcrumb({
  artistId,
  artistName,
  tourId,
  tourName,
}: TourBreadcrumbProps) {
  const pathname = usePathname() ?? '';
  const pageLabel = derivePageLabel(pathname, tourId);
  if (!pageLabel) return null;

  return (
    <div
      className="lp-tour-breadcrumb print:hidden"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--lp-z-sticky)',
        background: 'color-mix(in srgb, var(--lp-bg) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--lp-border)',
        // Negative margin flushes the strip against the parent's top
        // padding so it sits visually attached to the TopBar bottom
        // edge, the same way AdvanceShowContextBar's `flush` mode
        // works inside DocumentCanvas.
        marginTop: 'calc(-1 * var(--lp-content-padding-y, 24px))',
        marginLeft: 'calc(-1 * var(--lp-content-padding-x, 24px))',
        marginRight: 'calc(-1 * var(--lp-content-padding-x, 24px))',
        marginBottom: 'var(--lp-space-4, 16px)',
        padding: 'var(--lp-space-3, 12px) var(--lp-content-padding-x, 24px)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <nav
          className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1"
          aria-label="Breadcrumb"
        >
          <Link
            href={`/artists/${artistId}`}
            className="inline-flex items-center gap-1 text-sm transition-colors"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate">{artistName}</span>
          </Link>
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          <Link
            href={`/tours/${tourId}`}
            className="text-sm transition-colors"
            style={{ color: 'var(--lp-text-secondary)' }}
          >
            <span className="truncate">{tourName}</span>
          </Link>
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--lp-text-tertiary)' }}
          />
          <span
            aria-current="page"
            className="truncate text-sm"
            style={{
              color: 'var(--lp-text)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          >
            {pageLabel}
          </span>
        </nav>
        <Link
          href={`/tours/${tourId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text-secondary)',
            fontWeight: 'var(--lp-weight-medium)',
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to tour
        </Link>
      </div>
    </div>
  );
}
