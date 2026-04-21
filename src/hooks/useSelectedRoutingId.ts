'use client';

import { useEffect, useState } from 'react';

/**
 * Manages the currently-selected routing_id for a tour, synced with URL hash.
 * Default selection = first routing id in the provided array (if any).
 * URL shape: /tours/<id>/routing#d=<routing_id>
 */
export function useSelectedRoutingId(routingIds: string[]) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.hash.match(/(?:^|[&#])d=([^&]+)/);
    const fromHash = m?.[1] ?? null;
    if (fromHash && routingIds.includes(fromHash)) {
      queueMicrotask(() => {
        setSelected((curr) => (curr === fromHash ? curr : fromHash));
      });
    } else if (routingIds.length > 0 && !selected) {
      const first = routingIds[0];
      queueMicrotask(() => {
        setSelected((curr) => curr ?? first);
      });
    }
  }, [routingIds, selected]);

  useEffect(() => {
    if (typeof window === 'undefined' || !selected) return;
    const next = `#d=${selected}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [selected]);

  return [selected, setSelected] as const;
}
