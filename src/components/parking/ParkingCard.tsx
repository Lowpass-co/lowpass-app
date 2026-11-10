'use client';

/* The Parking card on a show's advance (Nov 2026): what's on the map, and
   the way in. Reads the map lazily so the advance page load is unchanged. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ParkingSquare } from 'lucide-react';
import type { SavedParkingMap } from '@/server/parking/maps';
import { summariseMap } from '@/lib/parking/summary';

export function ParkingCard({ tourId, routingId, index }: { tourId: string; routingId: string; index: number }) {
  const [map, setMap] = useState<SavedParkingMap | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(`/api/tours/${tourId}/advance/${routingId}/parking`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { map?: SavedParkingMap | null } | null) => live && setMap(j?.map ?? null))
      .catch(() => live && setMap(null));
    return () => {
      live = false;
    };
  }, [tourId, routingId]);

  const href = `/advance/${tourId}/${routingId}/parking`;
  const line = map ? summariseMap(map.items) : null;
  return (
    <div className="adv-card" style={{ ['--i' as string]: index }}>
      <h3>Parking</h3>
      {map === undefined ? (
        <span className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>…</span>
      ) : map && line ? (
        <span style={{ fontSize: 'var(--lp-text-sm)' }}>{line}</span>
      ) : (
        <span className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>
          Draw where the buses and trucks go, at true size on the satellite map, and send drivers the PDF.
        </span>
      )}
      {map?.pdf?.exportedAt ? (
        <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>
          PDF {new Date(map.pdf.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · in Files
        </span>
      ) : null}
      <Link className="adv-btn adv-btn-sm" href={href} style={{ alignSelf: 'flex-start' }}>
        <ParkingSquare size={14} aria-hidden /> {map ? 'Open parking map' : 'Draw the parking map'}
      </Link>
    </div>
  );
}
