/* ============================================
   LOWPASS — Operations · Tour landing (Phase 1 §C placeholder)

   /operations/[tourId] — replaces /tours/[id] / /tours/[id]/summary.
   Phase 4 ports the canonical Operations landing here.

   Sprint 7 §3 — fetches artist + tour rows and mounts the new
   <TourHeader> at the top so the operator orients on the
   tour identity even while the page body is still a placeholder.
   Operations sub-routes (personnel, routing, etc.) are still
   placeholders pending Phase 4; they don't get TourHeader yet —
   to be added when they're properly built out.
   ============================================ */

import { notFound } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';

export default async function OperationsTourLandingPage({
  params,
}: {
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
      <PhaseScaffoldPlaceholder
        title="Operations · tour overview"
        phase="Phase 4"
        body="The Operations tour-landing is the canonical entry for this tour: setup status, primary CTA, secondary cards, and the Tour Hub navigation. Phase 4 ports the existing /tours/[id]/summary content here."
      />
    </ProductShell>
  );
}
