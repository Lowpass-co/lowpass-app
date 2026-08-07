'use client';

/* ============================================
   LOWPASS — Channel-list empty state (Adam, 2026-08-07)

   Formerly this dead-ended without a rider pack ("create one under Riders…").
   Adam: "there's no reason we should have to go to riders to then add a
   channel list." The create path is now standalone — <NewChannelListButton>
   creates a channel_list document pack, seeds its section (16 blank rows),
   and attaches it TOUR-WIDE, so it applies to every show and surfaces in the
   tour's rider automatically. No rider pack required.

   The artist link is the only remaining prerequisite (rider_packs.artist_id
   is NOT NULL), so a tour with no artist falls back to a pointer.
   ============================================ */

import { NewChannelListButton } from '@/components/channel-list/NewChannelListButton';

export function ChannelListEmptyState({
  tourId,
  artistId,
  tourName,
}: {
  tourId: string;
  /** tours.artist_id — null when the tour isn't linked to an artist yet. */
  artistId: string | null;
  tourName: string;
}) {
  if (!artistId) {
    return (
      <p className="rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-8 text-center text-sm text-lp-text-secondary">
        This tour isn’t linked to an artist yet, so a channel list can’t be created here.
        Link an artist from the tour’s{' '}
        <a className="text-lp-orange hover:underline" href={`/operations/${tourId}/riders`}>
          Riders →
        </a>{' '}
        setup first.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-lp-border bg-lp-surface/60 px-4 py-12 text-center">
      <div>
        <p className="text-sm font-medium text-lp-text">No channel list yet</p>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Create one right here — it starts with 16 blank channels you can edit in place.
        </p>
      </div>
      <NewChannelListButton tourId={tourId} artistId={artistId} tourName={tourName} />
    </div>
  );
}
