'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const AdvanceSectionBuilder = dynamic(
  () =>
    import(
      '@/app/(app)/tours/[id]/advance/[routingId]/AdvanceSectionBuilder'
    ).then((m) => ({ default: m.AdvanceSectionBuilder })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-8 text-sm text-lp-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
      </div>
    ),
  }
);

export function AdvanceSectionBuilderDynamic({
  tourId,
  routingId,
}: {
  tourId: string;
  routingId: string;
}) {
  return <AdvanceSectionBuilder tourId={tourId} routingId={routingId} />;
}
