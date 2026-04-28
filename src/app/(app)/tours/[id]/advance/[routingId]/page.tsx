/* ============================================
   LOWPASS — Advance Show Page (UX17)

   Default: clean read view of all advance data.
   ?mode=edit → drops into the section builder form.

   UX17: content is wrapped in <DocumentCanvas mode="prose"> for consistent
   chrome (scroll container, prose typography, section-anchor tracking).
   The existing AdvanceShowReadView / AdvanceSectionBuilderDynamic render
   their own anchors today; the DocumentCanvas wrapper still adds the
   structural prose container.
   ============================================ */

import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
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
  const { data: rRow } = await supabase
    .from('routing')
    .select('date')
    .eq('id', routingId)
    .maybeSingle();
  const dayRail = await getDocDaysLeftRail(tourId, {
    activeDate: (rRow?.date as string) || undefined,
  });

  const isEdit = mode === 'edit';

  return docDaysAppPageShell(
    <DocumentCanvas
      mode="prose"
      sections={ADVANCE_SECTIONS}
      editable={isEdit}
      maxHeight="calc(100vh - var(--lp-page-header-h, 96px))"
    >
      {isEdit ? (
        <AdvanceSectionBuilderDynamic tourId={tourId} routingId={routingId} />
      ) : (
        <AdvanceShowReadView tourId={tourId} routingId={routingId} />
      )}
    </DocumentCanvas>,
    dayRail,
  );
}
