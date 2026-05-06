/* ============================================
   LOWPASS — Sprint 8.1 §2 — /advance/[tourId] layout

   Hoists <ProductShell> + <TourHeader> from each page.tsx into
   one shared layout so the <ArtistTourSwitcher> wrapper persists
   across [routingId] navigation and across [tourId] changes.

   currentTourKeyStat: tour-level advance completion %, which
   matches the [tourId] root page's stat. The [routingId] page
   inherits this layout's value rather than computing its own
   per-section stat (Sprint 8.1 protocol: no override island).
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { formatTourKeyStat } from '@/components/shell-v2/tour-key-stat';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';

export default async function AdvanceTourLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_id, start_date, end_date')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) notFound();

  const tourRow = tour as {
    id: string;
    name: string | null;
    artist_id: string | null;
    start_date: string | null;
    end_date: string | null;
  };

  const [artistRes, routingRes] = await Promise.all([
    tourRow.artist_id
      ? supabase
          .from('artists')
          .select('id, name, branding, spotify_id, spotify_image_url')
          .eq('id', tourRow.artist_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('routing')
      .select('id, date')
      .eq('tour_id', tourId),
  ]);

  const artistRow = artistRes.data as {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
  } | null;

  const artistLogoUrl = artistRow
    ? await resolveArtistLogoUrl(artistRow)
    : null;

  // Tour-level advance stats — same shape the [tourId] root page
  // computed before the hoist. The advance_instances table stores
  // per-show status; we count complete vs total dated routing rows
  // to derive the completion percent for the trigger + header.
  const routingRows = (routingRes.data ?? []) as Array<{
    id: string;
    date: string | null;
  }>;
  const datedRoutingIds = routingRows
    .filter((r) => r.date)
    .map((r) => r.id);

  const { data: advanceData } =
    datedRoutingIds.length > 0
      ? await supabase
          .from('advance_instances')
          .select('routing_id, status')
          .in('routing_id', datedRoutingIds)
      : { data: [] as Array<{ routing_id: string; status: string | null }> };

  const advanceRows = (advanceData ?? []) as Array<{
    routing_id: string;
    status: string | null;
  }>;
  const completedCount = advanceRows.filter(
    (a) => a.status === 'complete',
  ).length;
  const pendingCount = advanceRows.filter(
    (a) =>
      a.status === null ||
      a.status === 'in_progress' ||
      a.status === 'needs_review',
  ).length;
  const advanceCompletePercent =
    datedRoutingIds.length > 0
      ? (completedCount / datedRoutingIds.length) * 100
      : null;

  return (
    <ProductShell
      active="advance"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Advance"
      currentTourKeyStat={formatTourKeyStat('advance', {
        advanceCompletePercent,
      })}
    >
      {artistRow ? (
        <TourHeader
          artistId={artistRow.id}
          artistName={artistRow.name}
          artistLogoUrl={artistLogoUrl}
          tourId={tourId}
          tourName={tourRow.name ?? 'Tour'}
          startDate={tourRow.start_date}
          endDate={tourRow.end_date}
          product="advance"
          stats={{
            showCount: datedRoutingIds.length,
            advanceCompletePercent,
            advancePendingCount: pendingCount,
          }}
        />
      ) : null}
      {children}
    </ProductShell>
  );
}
