'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const TourBudgetAccordion = dynamic(
  () => import('./TourBudgetAccordion').then((m) => ({ default: m.TourBudgetAccordion })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-8 text-sm text-lp-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading budget…
      </div>
    ),
  }
);

export function TourBudgetAccordionDynamic({ tourId }: { tourId: string }) {
  return <TourBudgetAccordion tourId={tourId} />;
}
