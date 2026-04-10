/* ============================================
   LOWPASS — Advance Show Page

   Default: clean read view of all advance data.
   ?mode=edit → drops into the section builder form.
   ============================================ */

import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { AdvanceSectionBuilderDynamic } from '@/components/advance/AdvanceSectionBuilderDynamic';

export default async function AdvanceShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; routingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id: tourId, routingId } = await params;
  const { mode } = await searchParams;

  if (mode === 'edit') {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <AdvanceSectionBuilderDynamic tourId={tourId} routingId={routingId} />
      </div>
    );
  }

  return (
    <div className="-mx-6 -my-6">
      <AdvanceShowReadView tourId={tourId} routingId={routingId} />
    </div>
  );
}
