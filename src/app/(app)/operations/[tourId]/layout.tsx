/* ============================================
   LOWPASS — Sprint 8.1 §2 — /operations/[tourId] layout

   Hoists <ProductShell> + <TourHeader> from each page.tsx into
   one shared layout so the <ArtistTourSwitcher> wrapper persists
   across same-product navigation (root → personnel → routing →
   …) and across [tourId] changes (A → B). The wrapper's open-
   state previously got reset because each page mounted its own
   ProductShell instance.

   Sub-routes' page.tsx files render only their body content;
   chrome (rail + header + tour identity strip) is here.

   Sprint 8.2 §1 — the per-product currentTourKeyStat third
   dot-segment was dropped from the switcher trigger after Adam's
   smoke ("PASS BUT the info is irrelevant. remove it."). The
   layout no longer threads a keyStat string — TourHeader still
   renders the equivalent info on its stats line beneath the
   tour name.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';

export default async function OperationsTourLayout({
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
    .select(
      'id, name, artist_id, start_date, end_date, band_count, crew_count, principal_count',
    )
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) notFound();

  const tourRow = tour as {
    id: string;
    name: string;
    artist_id: string | null;
    start_date: string | null;
    end_date: string | null;
    band_count: number | null;
    crew_count: number | null;
    principal_count: number | null;
  };

  const [artistRes, routingCountRes] = await Promise.all([
    tourRow.artist_id
      ? supabase
          .from('artists')
          .select('id, name, branding, spotify_id, spotify_image_url')
          .eq('id', tourRow.artist_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('routing')
      .select('id', { count: 'exact', head: true })
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

  // Crew total = principals + band + crew (schema splits them).
  const crewCount =
    (tourRow.band_count ?? 0) +
    (tourRow.crew_count ?? 0) +
    (tourRow.principal_count ?? 0);

  return (
    <ProductShell
      active="operations"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Operations"
    >
      {artistRow ? (
        <TourHeader
          artistId={artistRow.id}
          artistName={artistRow.name}
          artistLogoUrl={artistLogoUrl}
          tourId={tourId}
          tourName={tourRow.name}
          startDate={tourRow.start_date}
          endDate={tourRow.end_date}
          product="operations"
          stats={{
            showCount: routingCountRes.count ?? null,
            crewCount: crewCount > 0 ? crewCount : null,
            // legCount sourced from flight-legs table when that
            // surface lands — deferred. TourHeader gracefully
            // omits empty fields from the stats line.
            legCount: null,
          }}
        />
      ) : null}
      {children}
    </ProductShell>
  );
}
