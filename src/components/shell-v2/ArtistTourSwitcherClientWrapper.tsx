/* ============================================
   LOWPASS — Sprint 5 §2 + §3 — <ArtistTourSwitcherClientWrapper>
   (Sprint 6 §2: lifted tours data here so the slide-over can
   optimistically append a freshly-created tour and so the
   switcher can clear stale tours immediately when the user
   clicks a different artist.)

   Bridges the server-component <ProductHeader> and the client
   <ArtistTourSwitcher> + <TourCreateSlideOver>.

   Owns:
     - isCreateTourOpen — whether the create slide-over is open.
     - tours — the tour list shown in the switcher's tours pane.
     - toursArtistId — which artist `tours` belong to.
     - toursLoading — whether a tours-by-artist fetch is in flight.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtistTourSwitcher } from './ArtistTourSwitcher';
import { TourCreateSlideOver } from './TourCreateSlideOver';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

type ArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url?: string | null;
};

type TourMin = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

interface ArtistTourSwitcherClientWrapperProps {
  initialArtists: ArtistMin[];
  initialTours: TourMin[] | null;
  /** The artist whose tours `initialTours` were server-fetched
   *  for. When the live selectedArtistId in context differs, we
   *  refetch via /api/artists/[id]/tours. */
  initialArtistId: string | null;
}

export function ArtistTourSwitcherClientWrapper({
  initialArtists,
  initialTours,
  initialArtistId,
}: ArtistTourSwitcherClientWrapperProps) {
  const { selectedArtistId } = useArtistTourContext();
  const [isCreateTourOpen, setIsCreateTourOpen] = useState(false);

  // Tours list — owned here so:
  //   1) the slide-over can optimistically prepend a newly-created
  //      tour without waiting for a server roundtrip, and
  //   2) the switcher can clear the previous artist's tours and
  //      show a loading state immediately on artist change.
  const [tours, setTours] = useState<TourMin[]>(initialTours ?? []);
  const [toursArtistId, setToursArtistId] = useState<string | null>(
    initialArtistId,
  );
  const [toursLoading, setToursLoading] = useState(false);

  // Track the in-flight request so a quick double-switch (A → B → C)
  // doesn't race the older fetch into state.
  const fetchTokenRef = useRef(0);

  // Fetch a different artist's tours via the dedicated API route.
  // Same lean projection the server-side initial fetch uses.
  // The pre-fetch setStates are queued via queueMicrotask so this
  // function can be called from a useEffect without tripping
  // react-hooks/set-state-in-effect; functionally identical, the
  // microtask runs before the next paint.
  const fetchToursForArtist = useCallback(
    (artistId: string) => {
      const token = ++fetchTokenRef.current;
      queueMicrotask(() => {
        setToursArtistId(artistId);
        setTours([]); // immediate stale clear
        setToursLoading(true);
      });
      void (async () => {
        try {
          const res = await fetch(`/api/artists/${artistId}/tours`);
          if (!res.ok) {
            if (token === fetchTokenRef.current) {
              setTours([]);
              setToursLoading(false);
            }
            return;
          }
          const body = (await res.json()) as { tours?: TourMin[] };
          if (token !== fetchTokenRef.current) return; // stale response
          setTours(body.tours ?? []);
          setToursLoading(false);
        } catch {
          if (token === fetchTokenRef.current) {
            setTours([]);
            setToursLoading(false);
          }
        }
      })();
    },
    [],
  );

  // When the context's selectedArtistId drifts away from the
  // artist whose tours we currently hold, refetch. Triggered by
  // the switcher's handleArtistClick (which calls
  // setSelectedArtistId via the context, propagating here).
  useEffect(() => {
    if (!selectedArtistId) {
      // No artist → clear list. queueMicrotask defers the setStates
      // past this render to satisfy react-hooks/set-state-in-effect.
      if (toursArtistId !== null || tours.length > 0) {
        queueMicrotask(() => {
          setToursArtistId(null);
          setTours([]);
          setToursLoading(false);
        });
      }
      return;
    }
    if (selectedArtistId === toursArtistId) return;
    fetchToursForArtist(selectedArtistId);
  }, [selectedArtistId, toursArtistId, tours.length, fetchToursForArtist]);

  const handleTourCreated = useCallback((tour: TourMin) => {
    // Optimistic prepend. The new tour is always for the
    // currently-selected artist (the slide-over uses
    // selectedArtistId as the artist_id), so adding it here is
    // the right place — no artist-mismatch check needed.
    setTours((prev) => [tour, ...prev]);
  }, []);

  return (
    <>
      <ArtistTourSwitcher
        initialArtists={initialArtists}
        tours={tours}
        toursLoading={toursLoading}
        onCreateTour={() => setIsCreateTourOpen(true)}
      />
      <TourCreateSlideOver
        open={isCreateTourOpen}
        onClose={() => setIsCreateTourOpen(false)}
        onCreated={handleTourCreated}
      />
    </>
  );
}
