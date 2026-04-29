/* ============================================
   LOWPASS — Advance Show Page (UX17 + UX22 phases 2 & cleanup-P1)

   Default: clean read view of all advance data.
   ?mode=edit → drops into the section builder form.

   Read mode keeps the prose canvas (UX17) — it's a document.
   Edit mode renders OUTSIDE DocumentCanvas at full PageShell width
   (UX22 cleanup P1) — it's an app surface, and the prose canvas's
   720px hard cap was squashing the builder's two-column layout.

   The sticky <AdvanceShowContextBar> (UX22 phase 2) renders as the
   first child of either branch so the operator always sees Artist ·
   Tour · Day · Date · Venue · City + a live progress chip.
   ============================================ */

import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { AdvanceShowContextBar } from '@/components/advance/AdvanceShowContextBar';
import {
  docDaysAppPageShell,
  documentSectionsAppPageShell,
} from '@/components/shell/app-page-shells';
import { getDocDaysLeftRail } from '@/lib/shell/rails/docDaysForTour';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { AdvanceSectionBuilderDynamic } from '@/components/advance/AdvanceSectionBuilderDynamic';
import { DocumentCanvas } from '@/components/document/DocumentCanvas';

/**
 * UX17 §3.2 canonical advance section list. AdvanceShowReadView's
 * `<section>` cards (UX22 phase 3) emit `id="advance-{slug}"` so the
 * read view's IntersectionObserver picks up matching labels.
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
  const isEdit = mode === 'edit';

  const supabase = await createServerSupabaseClient();

  // Identity for the context bar + (in edit mode) the section list to
  // populate the LeftRail's docSections variant. Day rail is fetched
  // server-side in read mode; edit mode replaces it with a section rail.
  const [routingRes, tourRes, advanceRes] = await Promise.all([
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
    isEdit
      ? supabase
          .from('advance_instances')
          .select('id, sections')
          .eq('routing_id', routingId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const routing = routingRes.data as
    | { date: string; day_type: string | null; venue_name: string | null; city: string | null }
    | null;
  const tourRow = tourRes.data as
    | {
        id: string;
        name: string;
        artist:
          | { id: string; name: string; branding: unknown }
          | { id: string; name: string; branding: unknown }[]
          | null;
      }
    | null;
  const artistRow = Array.isArray(tourRow?.artist) ? tourRow?.artist[0] : tourRow?.artist;

  const contextBar =
    tourRow && artistRow && routing ? (
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

  if (isEdit) {
    // UX22 cleanup P1: edit view runs outside DocumentCanvas at full
    // PageShell width. The previous 720px cap was the root cause of
    // the squashed two-column-inside-two-column layout reported in
    // the audit. LeftRail switches to docSections (built from the
    // advance instance's section list) so the in-page floating <aside>
    // can be retired.
    type SectionRow = { template_id: string; label: string; order?: number };
    const advanceRow = advanceRes?.data as { sections?: SectionRow[] | null } | null;
    const sectionRows = (advanceRow?.sections ?? []) as SectionRow[];
    const sectionRail = [...sectionRows]
      .filter((s) => s && s.template_id && s.label)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({
        id: `section-${s.template_id}`,
        label: s.label,
        href: `/tours/${tourId}/advance/${routingId}?mode=edit#section-${s.template_id}`,
      }));

    // Static fallback when the advance instance is brand-new (no sections
    // yet) — Setup mode handles that flow inside the builder; the rail just
    // shows the canonical 8 placeholders so the column isn't empty.
    const fallbackRail = ADVANCE_SECTIONS.map((s) => ({
      id: s.id,
      label: s.label,
      href: `/tours/${tourId}/advance/${routingId}?mode=edit#${s.id}`,
    }));

    return documentSectionsAppPageShell(
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-2 pb-12">
        {contextBar}
        <AdvanceSectionBuilderDynamic tourId={tourId} routingId={routingId} />
      </div>,
      {
        kind: 'docSections',
        sections: sectionRail.length > 0 ? sectionRail : fallbackRail,
        activeId: sectionRail[0]?.id ?? fallbackRail[0]?.id ?? '',
      },
    );
  }

  // Read mode: keep the day rail + the prose canvas. UX17 §3 contract.
  const dayRail = await getDocDaysLeftRail(tourId, {
    activeDate: routing?.date || undefined,
  });

  return docDaysAppPageShell(
    <DocumentCanvas
      mode="prose"
      sections={ADVANCE_SECTIONS}
      editable={false}
      maxHeight="calc(100vh - var(--lp-page-header-h, 96px))"
      surface
    >
      {contextBar}
      <AdvanceShowReadView tourId={tourId} routingId={routingId} />
    </DocumentCanvas>,
    dayRail,
  );
}
