/* ============================================
   LOWPASS — <TourSettingsTabs> (Nov 2026, Adam)

   Tour settings is one rail item over three pages that already exist:
     Details          /operations/[id]/settings   name, dates, currency, delete
     Dates & routing  /operations/[id]/routing    the day-by-day editor + import
     Money            /budget/[id]?tab=settings   approval, overheads, FX, exports
   Plain links (the URL is the source of truth; the rail lights "Tour settings"
   for all three — see ia.ts).
   ============================================ */

import Link from 'next/link';

export type TourSettingsTab = 'details' | 'routing' | 'money';

export function tourSettingsTabs(tourId: string): Array<{ id: TourSettingsTab; label: string; href: string }> {
  return [
    { id: 'details', label: 'Details', href: `/operations/${tourId}/settings` },
    { id: 'routing', label: 'Dates & routing', href: `/operations/${tourId}/routing` },
    { id: 'money', label: 'Money', href: `/budget/${tourId}?tab=settings` },
  ];
}

export function TourSettingsTabs({ tourId, active }: { tourId: string; active: TourSettingsTab }) {
  return (
    <nav
      aria-label="Tour settings"
      data-testid="tour-settings-tabs"
      className="inline-flex flex-wrap rounded-lg border border-lp-border bg-lp-surface p-0.5"
    >
      {tourSettingsTabs(tourId).map((it) => {
        const on = it.id === active;
        return (
          <Link
            key={it.id}
            href={it.href}
            aria-current={on ? 'page' : undefined}
            data-active={on ? 'true' : undefined}
            className="rounded-md px-3 py-1.5 text-sm font-medium no-underline"
            style={{
              color: on ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
              background: on ? 'var(--lp-surface-hover)' : 'transparent',
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
