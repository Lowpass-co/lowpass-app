/* ============================================
   LOWPASS — Advance · Tour overview (Visual redesign §B)

   /advance/[tourId] — wraps the existing UX22-phase-1
   <AdvanceOverview> in <ProductShell>, with the new sticky stats
   strip beneath ProductHeader and the dense visual treatment that
   matches the per-show advance + budget surfaces.

   Page-level data:
     - tour identity (for ProductShell + the title)
     - routing rows (date / day_type) for stats-strip computation
     - advance instances (status) for stats-strip completion %

   <AdvanceOverview> still owns the show list, filter chips, ⋯ menu,
   layout-template apply, copy-from flow — none of that moves.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductShell } from '@/components/shell-v2';
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { AdvanceOverview } from '@/components/advance/AdvanceOverview';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';

export default async function AdvanceTourOverviewPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const [{ data: tour, error: tourErr }, routingRes] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, artist_id, start_date, end_date')
      .eq('id', tourId)
      .maybeSingle(),
    supabase
      .from('routing')
      .select('id, date, day_type')
      .eq('tour_id', tourId),
  ]);

  if (tourErr || !tour) {
    notFound();
  }

  const t = tour as {
    id: string;
    name: string | null;
    artist_id: string | null;
    start_date: string | null;
    end_date: string | null;
  };

  // Sprint 8 §2 — fetch artist for the new <TourHeader> mount
  // on this overview page.
  const { data: artistRow } = t.artist_id
    ? await supabase
        .from('artists')
        .select('id, name, branding, spotify_id, spotify_image_url')
        .eq('id', t.artist_id)
        .maybeSingle()
    : { data: null };
  const artist = artistRow as {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
  } | null;
  const artistLogoUrl = artist
    ? await resolveArtistLogoUrl(artist)
    : null;

  const routingRows =
    (routingRes.data ?? []) as Array<{
      id: string;
      date: string | null;
      day_type: string | null;
    }>;

  // Advance statuses are looked up via routing_id; depends on the
  // routing read landing first so we can pass in the IDs.
  const routingIds = routingRows.map((r) => r.id);
  const { data: advanceData } =
    routingIds.length > 0
      ? await supabase
          .from('advance_instances')
          .select('routing_id, status')
          .in('routing_id', routingIds)
      : { data: [] as Array<{ routing_id: string; status: string | null }> };
  const advanceRows = (advanceData ?? []) as Array<{
    routing_id: string;
    status: string | null;
  }>;
  const statusByRouting = new Map(
    advanceRows.map((a) => [a.routing_id, a.status ?? null]),
  );

  const shows = routingRows
    .filter((r) => r.date)
    .map((r) => ({
      routingId: r.id,
      date: r.date as string,
      dayType: r.day_type,
      advanceStatus: statusByRouting.get(r.id) ?? null,
    }));

  // Sprint 8 §2 — TourHeader stats. Show count, % complete from
  // shows list, % pending from non-complete shows that haven't
  // had advance start. Mirror the per-show TourHeader's advance
  // stat calculation so both routes show consistent numbers.
  const completedShows = shows.filter(
    (s) => s.advanceStatus === 'complete',
  ).length;
  const advanceCompletePercent =
    shows.length > 0 ? (completedShows / shows.length) * 100 : null;
  const pendingShows = shows.filter(
    (s) =>
      s.advanceStatus === null ||
      s.advanceStatus === 'in_progress' ||
      s.advanceStatus === 'needs_review',
  ).length;

  return (
    <ProductShell
      active="advance"
      artistId={t.artist_id}
      tourId={t.id}
      productName="Advance"
    >
      {/* Sprint 8 §2 — replaces <AdvanceOverviewStatsStrip>.
          TourHeader carries equivalent stats (show count, % complete,
          pending count) plus the artist + tour identity at the
          top of every product surface. AdvanceOverviewStatsStrip
          file stays on disk for reference; flagged in deferred
          section as orphaned and removable in cleanup. */}
      {artist ? (
        <TourHeader
          artistId={artist.id}
          artistName={artist.name}
          artistLogoUrl={artistLogoUrl}
          tourId={t.id}
          tourName={t.name ?? 'Tour'}
          startDate={t.start_date}
          endDate={t.end_date}
          product="advance"
          stats={{
            showCount: shows.length,
            advanceCompletePercent,
            advancePendingCount: pendingShows,
          }}
        />
      ) : null}
      <div className="mx-auto w-full max-w-[1280px] space-y-5 px-6 py-6">
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <p
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Advance · {t.name ?? 'Tour'}
            </p>
            <h1 className="lp-h1 mt-1">Shows</h1>
            <p
              className="mt-1"
              style={{
                fontSize: '14px',
                color: 'var(--lp-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Per-show advance forms across this tour. Click a row to
              open the advance for that day.
            </p>
          </div>
        </header>

        <AdvanceOverview tourId={t.id} />
      </div>
    </ProductShell>
  );
}
