/* ============================================
   LOWPASS — Tour Layout

   Wraps all tour sub-pages with DetailPanelProvider
   and renders the line item detail slide-over.
   ============================================ */

import { DetailPanelProvider } from '@/contexts/DetailPanelContext';
import { TourDetailPanelWrapper } from '@/components/detail-panel/TourDetailPanelWrapper';

export default async function TourLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;

  return (
    <DetailPanelProvider>
      {children}
      <TourDetailPanelWrapper tourId={tourId} />
    </DetailPanelProvider>
  );
}
