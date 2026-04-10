/* ============================================
   LOWPASS — Advance Show Page

   Default: clean read view of all advance data.
   ?mode=edit → drops into the section builder form.
   ============================================ */

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';

const AdvanceSectionBuilder = dynamic(
  () => import('./AdvanceSectionBuilder').then(m => ({ default: m.AdvanceSectionBuilder })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-8 text-lp-text-secondary text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
      </div>
    ),
  }
);

export default async function AdvanceShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; routingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id: tourId, routingId } = await params;
  const { mode } = await searchParams;

  // Edit mode → full section builder form
  if (mode === 'edit') {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <AdvanceSectionBuilder tourId={tourId} routingId={routingId} />
      </div>
    );
  }

  // Default → clean read view
  return (
    <div className="-mx-6 -my-6">
      <AdvanceShowReadView tourId={tourId} routingId={routingId} />
    </div>
  );
}
