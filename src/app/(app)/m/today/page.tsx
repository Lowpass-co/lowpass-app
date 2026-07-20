'use client';

import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Local routing day comparable to YYYY-MM-DD in local TZ. */
function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MobileTodayLandingPage() {
  const router = useRouter();
  const { tourRouting, selectedTourId, hydrated, tours } = useArtistTourContext();
  const [message, setMessage] = useState('Finding today…');

  useEffect(() => {
    if (!hydrated) return;
    if (!selectedTourId) {
      queueMicrotask(() =>
        setMessage(tours?.length ? 'Select a tour in the workspace picker (sidebar).' : 'No tours yet.')
      );
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setMessage('Loading tour days…'));

    const todayKey = localDateKey();

    fetch(`/api/tours/${selectedTourId}/advance?all=true`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { dates?: { routing_id: string; date: string }[] }) => {
        if (cancelled) return;
        const dates = j.dates ?? [];
        const byKey = [...dates].sort((a, b) => a.date.localeCompare(b.date));
        const todayRow = byKey.find((row) => row.date === todayKey);
        if (todayRow) {
          router.replace(`/operations/${selectedTourId}/day/${todayRow.routing_id}`);
          return;
        }
        const next = byKey.find((row) => row.date > todayKey);
        if (next) {
          router.replace(`/operations/${selectedTourId}/day/${next.routing_id}`);
          return;
        }
        const last = byKey.filter((row) => row.date < todayKey).pop();
        if (last) {
          router.replace(`/operations/${selectedTourId}/day/${last.routing_id}`);
          return;
        }
        const fromCtx = tourRouting[0]?.id;
        if (fromCtx) router.replace(`/operations/${selectedTourId}/day/${fromCtx}`);
        else queueMicrotask(() => setMessage('No routing days found for this tour.'));
      })
      .catch(() => {
        if (!cancelled) queueMicrotask(() => setMessage('Could not load tour routing.'));
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, router, selectedTourId, tourRouting, tours?.length]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-base leading-relaxed text-lp-text-secondary">{message}</p>
    </div>
  );
}
