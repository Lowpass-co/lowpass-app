'use client';

import { useEffect } from 'react';
import { useDetailPanel } from '@/contexts/DetailPanelContext';
import { LineItemDetailPanel } from './LineItemDetailPanel';

export function TourDetailPanelWrapper({ tourId }: { tourId: string }) {
  const { openLineItemId, closePanel, openLineItem } = useDetailPanel();

  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail ?? {};
      if (id) openLineItem(id);
    };
    window.addEventListener('lp-open-line-item', handler);
    return () => window.removeEventListener('lp-open-line-item', handler);
  }, [openLineItem]);

  return (
    <LineItemDetailPanel
      lineItemId={openLineItemId}
      tourId={tourId}
      onClose={closePanel}
    />
  );
}
