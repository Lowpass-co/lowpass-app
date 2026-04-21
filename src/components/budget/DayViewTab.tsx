'use client';

import { useCallback, useEffect, useState } from 'react';
import { RoutingIncomePanel } from '@/components/day-view/RoutingIncomePanel';

export function DayViewTab({ tourId }: { tourId: string }) {
  const [selectedRoutingId, setSelectedRoutingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/tours/${encodeURIComponent(tourId)}/routing`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!active) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setSelectedRoutingId(rows[0].id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tourId]);

  const handleRoutingIdChange = useCallback((id: string) => {
    setSelectedRoutingId(id);
  }, []);

  return (
    <RoutingIncomePanel
      tourId={tourId}
      selectedRoutingId={selectedRoutingId}
      onRoutingIdChange={handleRoutingIdChange}
      showDayStrip
    />
  );
}

