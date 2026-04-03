'use client';

import { Suspense, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { DetailPanelProvider } from '@/contexts/DetailPanelContext';
import { TourDetailPanelWrapper } from '@/components/detail-panel/TourDetailPanelWrapper';

function BudgetTourPanelMount() {
  const searchParams = useSearchParams();
  const tourId = searchParams.get('tour_id') ?? '';
  if (!tourId) return null;
  return <TourDetailPanelWrapper tourId={tourId} />;
}

/**
 * Budget uses ?tour_id= (not /tours/[id]). Hotels/Flights/Transport/Production call
 * useDetailPanel — they must sit under DetailPanelProvider like tour sub-pages.
 */
export function BudgetDetailPanelLayout({ children }: { children: ReactNode }) {
  return (
    <DetailPanelProvider>
      {children}
      <Suspense fallback={null}>
        <BudgetTourPanelMount />
      </Suspense>
    </DetailPanelProvider>
  );
}
