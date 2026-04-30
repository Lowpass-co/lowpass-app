/* ============================================
   LOWPASS — Advance · Per-show page (Phase 2 §A migration)

   /advance/[tourId]/[routingId] — replaces
   /tours/[id]/advance/[routingId]. Both read mode (default) and
   edit mode (?mode=edit) live here. <ProductShell> replaces the
   legacy docDaysAppPageShell + documentSectionsAppPageShell shells.

   The legacy edit shell carried a docSections rail that linked to
   in-page anchors. <ProductShell>'s left rail is the product rail,
   not a per-page TOC; the section navigation is owned by
   <AdvanceSectionBuilder> internally (its own sticky in-page nav).
   Read mode loses the day-strip rail too — Phase 4 (Operations)
   re-introduces a day-strip when it migrates the tour landing.

   The sticky <AdvanceShowContextBar> still renders inside the
   product main area as the first child so the operator always sees
   Artist · Tour · Day · Date · Venue · City + a live progress chip.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductShell } from '@/components/shell-v2';
import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { AdvanceShowContextBar } from '@/components/advance/AdvanceShowContextBar';
import { AdvanceSectionBuilderDynamic } from '@/components/advance/AdvanceSectionBuilderDynamic';
import { PreviouslyPlayedButton } from '@/components/advance/PreviouslyPlayedButton';

/** Pull a likely artist image URL out of the freeform `branding` JSONB. */
function pickArtistImageUrl(branding: unknown): string | null {
  if (!branding || typeof branding !== 'object') return null;
  const b = branding as Record<string, unknown>;
  const candidates = [
    b.image_url,
    b.imageUrl,
    b.logo_url,
    b.logoUrl,
    b.avatar_url,
    b.avatarUrl,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

export default async function AdvanceShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { tourId, routingId } = await params;
  const { mode } = await searchParams;
  const isEdit = mode === 'edit';

  const supabase = await createServerSupabaseClient();

  const [routingRes, tourRes] = await Promise.all([
    supabase
      .from('routing')
      .select('date, day_type, venue_name, city')
      .eq('id', routingId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select('id, name, artist_id, artist:artists(id, name, branding)')
      .eq('id', tourId)
      .maybeSingle(),
  ]);

  const routing = routingRes.data as
    | {
        date: string;
        day_type: string | null;
        venue_name: string | null;
        city: string | null;
      }
    | null;
  const tourRow = tourRes.data as
    | {
        id: string;
        name: string;
        artist_id: string | null;
        artist:
          | { id: string; name: string; branding: unknown }
          | { id: string; name: string; branding: unknown }[]
          | null;
      }
    | null;

  if (!tourRow) notFound();

  const artistRow = Array.isArray(tourRow.artist)
    ? tourRow.artist[0]
    : tourRow.artist;

  const contextBar =
    artistRow && routing ? (
      <AdvanceShowContextBar
        tourId={tourId}
        routingId={routingId}
        artist={{
          id: artistRow.id,
          name: artistRow.name ?? 'Artist',
          imageUrl: pickArtistImageUrl(artistRow.branding),
        }}
        tour={{ id: tourRow.id, name: tourRow.name ?? 'Tour' }}
        show={{
          date: routing.date,
          dayType: routing.day_type,
          venueName: routing.venue_name,
          city: routing.city,
        }}
        flush={!isEdit}
      />
    ) : null;

  return (
    <ProductShell
      active="advance"
      artistId={tourRow.artist_id ?? artistRow?.id ?? null}
      tourId={tourRow.id}
      productName="Advance"
    >
      {isEdit ? (
        <div className="mx-auto w-full max-w-[1400px] space-y-4 px-2 pb-12 pt-4">
          {contextBar}
          <AdvanceSectionBuilderDynamic
            tourId={tourId}
            routingId={routingId}
          />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1100px] space-y-4 px-6 py-6">
          {contextBar}
          {/* Phase 2 §C — Previously Played affordance. Renders only on
              the read view (edit view has its own copy-from-previous
              flow inside the section builder). */}
          <div className="advance-read-no-print flex justify-end">
            <PreviouslyPlayedButton
              tourId={tourId}
              routingId={routingId}
            />
          </div>
          <AdvanceShowReadView tourId={tourId} routingId={routingId} />
        </div>
      )}
    </ProductShell>
  );
}
