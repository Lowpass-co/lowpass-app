/* ============================================
   LOWPASS — Advance Show Page (UX17 + UX22 phase 2)

   Default: clean read view of all advance data.
   ?mode=edit → drops into the section builder form.

   UX17: content is wrapped in <DocumentCanvas mode="prose"> for consistent
   chrome (scroll container, prose typography, section-anchor tracking).

   UX22 phase 2: a sticky <AdvanceShowContextBar> renders as the first
   child of the prose slot. It carries Artist · Tour · Day-type · Date ·
   Venue · City + a live sections-progress chip so the operator never
   loses track of which show they're editing as they scroll.
   ============================================ */

import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { AdvanceShowContextBar } from '@/components/advance/AdvanceShowContextBar';
import { docDaysAppPageShell } from '@/components/shell/app-page-shells';
import { getDocDaysLeftRail } from '@/lib/shell/rails/docDaysForTour';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AdvanceSectionBuilderDynamic } from '@/components/advance/AdvanceSectionBuilderDynamic';
import { DocumentCanvas } from '@/components/document/DocumentCanvas';

/**
 * UX17 §3.2 canonical advance section list. The inner read/edit components
 * don't yet emit id="advance-*" anchors, so the IntersectionObserver-driven
 * highlight is a no-op for now. The wrapper still provides the scroll
 * container + prose styling + editable hint. TODO(UX17 follow-up): tag
 * inner sections with these ids so the rail tracks during scroll.
 */
const ADVANCE_SECTIONS = [
  { id: 'advance-overview', label: 'Overview' },
  { id: 'advance-travel', label: 'Travel' },
  { id: 'advance-hotel', label: 'Hotel' },
  { id: 'advance-venue', label: 'Venue' },
  { id: 'advance-schedule', label: 'Schedule' },
  { id: 'advance-tech', label: 'Tech' },
  { id: 'advance-catering', label: 'Catering' },
  { id: 'advance-settlement', label: 'Settlement' },
];

/** Pull a likely artist image URL out of the freeform `branding` JSONB. */
function pickArtistImageUrl(branding: unknown): string | null {
  if (!branding || typeof branding !== 'object') return null;
  const b = branding as Record<string, unknown>;
  const candidates = [b.image_url, b.imageUrl, b.logo_url, b.logoUrl, b.avatar_url, b.avatarUrl];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

export default async function AdvanceShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; routingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id: tourId, routingId } = await params;
  const { mode } = await searchParams;

  const supabase = await createServerSupabaseClient();

  // UX22 phase 2 — fetch identity for the context bar in parallel with the
  // routing date used by the day rail's activeDate hint.
  const [routingRes, tourRes] = await Promise.all([
    supabase
      .from('routing')
      .select('date, day_type, venue_name, city')
      .eq('id', routingId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select('id, name, artist:artists(id, name, branding)')
      .eq('id', tourId)
      .maybeSingle(),
  ]);

  const routing = routingRes.data as
    | { date: string; day_type: string | null; venue_name: string | null; city: string | null }
    | null;
  const tourRow = tourRes.data as
    | {
        id: string;
        name: string;
        artist: { id: string; name: string; branding: unknown } | { id: string; name: string; branding: unknown }[] | null;
      }
    | null;
  const artistRow = Array.isArray(tourRow?.artist) ? tourRow?.artist[0] : tourRow?.artist;

  const dayRail = await getDocDaysLeftRail(tourId, {
    activeDate: routing?.date || undefined,
  });

  const isEdit = mode === 'edit';

  return docDaysAppPageShell(
    <DocumentCanvas
      mode="prose"
      sections={ADVANCE_SECTIONS}
      editable={isEdit}
      maxHeight="calc(100vh - var(--lp-page-header-h, 96px))"
    >
      {tourRow && artistRow && routing ? (
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
        />
      ) : null}

      {isEdit ? (
        <AdvanceSectionBuilderDynamic tourId={tourId} routingId={routingId} />
      ) : (
        <AdvanceShowReadView tourId={tourId} routingId={routingId} />
      )}
    </DocumentCanvas>,
    dayRail,
  );
}
