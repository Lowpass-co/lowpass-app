/* ============================================
   LOWPASS — Setup Status Strip (Tour Hub X3)

   Build-once category chips: Routing / Channel list / Personnel /
   Rooming / Riders linked. Each shows green ✓ / gray — / orange ↗ N
   for the riders chip. Each chip is a Link to the relevant
   tour-internal page.

   Truth sources (per CC_BUDGET_REDESIGN_FIXUP.md X3.2):
     Routing      → routing.tour_id
     Channel list → channel_list_rows ▸ rider_packs.tour_id
     Personnel    → tour_personnel.tour_id
     Rooming      → rooming_grid.tour_id
     Riders linked → rider_packs.artist_id count
   ============================================ */

import Link from 'next/link';
import { ArrowUpRight, Check, Minus } from 'lucide-react';
import type { TourHubSetup } from '@/server/tours/getTourHubData';

type ChipProps = {
  label: string;
  href: string;
  state: 'done' | 'todo';
};

function StatusChip({ label, href, state }: ChipProps) {
  const tone =
    state === 'done'
      ? 'var(--color-lp-status-complete)'
      : 'var(--color-lp-status-not-started)';
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
      style={{
        borderColor: 'var(--lp-border)',
        background: `color-mix(in srgb, ${tone} 8%, var(--lp-surface))`,
        color: 'var(--lp-text)',
        fontSize: 'var(--lp-text-sm)',
        fontWeight: 'var(--lp-weight-medium)',
      }}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full"
        style={{ color: tone }}
      >
        {state === 'done' ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : (
          <Minus className="h-3 w-3" strokeWidth={3} />
        )}
      </span>
      {label}
    </Link>
  );
}

function RidersLinkedChip({ count, href }: { count: number; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'color-mix(in srgb, var(--color-lp-orange) 8%, var(--lp-surface))',
        color: 'var(--lp-text)',
        fontSize: 'var(--lp-text-sm)',
        fontWeight: 'var(--lp-weight-medium)',
      }}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center"
        style={{ color: 'var(--color-lp-orange)' }}
      >
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      Riders linked: {count}
    </Link>
  );
}

export function SetupStatusStrip({
  tourId,
  setup,
}: {
  tourId: string;
  setup: TourHubSetup;
}) {
  return (
    <section className="space-y-2">
      <h2
        style={{
          color: 'var(--lp-text-tertiary)',
          fontSize: 'var(--lp-text-xs)',
          fontWeight: 'var(--lp-weight-semibold)',
          letterSpacing: 'var(--lp-tracking-caps)',
          textTransform: 'uppercase',
        }}
      >
        Setup · build-once
      </h2>
      <div className="flex flex-wrap gap-2">
        <StatusChip
          label="Routing"
          href={`/tours/${tourId}/routing`}
          state={setup.routing ? 'done' : 'todo'}
        />
        <StatusChip
          label="Channel list"
          href={`/tours/${tourId}/channel-list`}
          state={setup.channelList ? 'done' : 'todo'}
        />
        <StatusChip
          label="Personnel"
          href={`/tours/${tourId}/personnel`}
          state={setup.personnel ? 'done' : 'todo'}
        />
        <StatusChip
          label="Rooming"
          href={`/tours/${tourId}/rooming`}
          state={setup.rooming ? 'done' : 'todo'}
        />
        <RidersLinkedChip
          count={setup.ridersLinked}
          href={`/tours/${tourId}/rider-packs`}
        />
      </div>
    </section>
  );
}
