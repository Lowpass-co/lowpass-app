/* ============================================
   LOWPASS — Advance Section Builder Page

   Per-show advance: SETUP (sections) or FILL (form data).
   ============================================ */

import { AdvanceSectionBuilder } from './AdvanceSectionBuilder';

export default async function AdvanceSectionBuilderPage({
  params,
}: {
  params: Promise<{ id: string; routingId: string }>;
}) {
  const { id: tourId, routingId } = await params;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AdvanceSectionBuilder tourId={tourId} routingId={routingId} />
    </div>
  );
}
