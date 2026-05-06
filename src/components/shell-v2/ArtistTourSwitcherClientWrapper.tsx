/* ============================================
   LOWPASS — Sprint 5 §2 + §3 — <ArtistTourSwitcherClientWrapper>
   (Sprint 6 §2: lifted tours data here so the slide-over can
   optimistically append a freshly-created tour and so the
   switcher can clear stale tours immediately when the user
   clicks a different artist.)
   (Sprint 6.1 §1: replaced the state-based effect guard with
   a ref so the wrapper's tours-fetch effect doesn't loop on
   itself. Sprint 6's effect put `tours.length` and
   `toursArtistId` in its deps array, which combined with the
   queueMicrotask state writes inside fetchToursForArtist let
   the effect re-fire with stale state in some interleavings —
   visible as a flashing <div hidden> in DevTools and, in
   Safari, escalated into "Maximum update depth exceeded" →
   client-side exception → white screen on /budget/[X].)

   Bridges the server-component <ProductHeader> and the client
   <ArtistTourSwitcher> + <TourCreateSlideOver>.

   Owns:
     - isCreateTourOpen — whether the create slide-over is open.
     - tours — the tour list shown in the switcher's tours pane.
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
  const [toursLoading, setToursLoading] = useState(false);

  // Sprint 6.1 §1 — ref-based guard. Tracks the artistId the
  // effect last initiated a fetch for. Lives in a ref so the
  // effect can read+write it synchronously without depending on
  // React state (which would put `toursArtistId` back in the
  // deps array, the structural cause of the Sprint 6 loop).
  const lastFetchedArtistIdRef = useRef<string | null>(initialArtistId);

  // Token guards against stale fetches racing into state on
  // quick A → B → C double-switches.
  const fetchTokenRef = useRef(0);

  // Fetch a different artist's tours via the dedicated API route.
  // Same lean projection the server-side initial fetch uses.
  // Pre-fetch setStates wrapped in queueMicrotask so this
  // function can be called from a useEffect without tripping
  // react-hooks/set-state-in-effect; functionally equivalent,
  // the microtask runs before the next paint.
  const fetchToursForArtist = useCallback(
    (artistId: string) => {
      const token = ++fetchTokenRef.current;
      queueMicrotask(() => {
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

  // Sprint 6.1 §1 — runs only when selectedArtistId changes.
  // Ref-based guard prevents re-fire when the effect's setState
  // calls cascade through queueMicrotask back into state changes.
  useEffect(() => {
    if (!selectedArtistId) {
      if (lastFetchedArtistIdRef.current !== null) {
        lastFetchedArtistIdRef.current = null;
        queueMicrotask(() => {
          setTours([]);
          setToursLoading(false);
        });
      }
      return;
    }
    if (selectedArtistId === lastFetchedArtistIdRef.current) return;
    lastFetchedArtistIdRef.current = selectedArtistId;
    fetchToursForArtist(selectedArtistId);
  }, [selectedArtistId, fetchToursForArtist]);

  const handleTourCreated = useCallback((tour: TourMin) => {
    // Optimistic prepend. The new tour is always for the
    // currently-selected artist (the slide-over uses
    // selectedArtistId as the artist_id), so adding it here is
    // the right place. Edge case noted for a future sprint:
    // a stale slide-over closure could in theory POST for
    // artist A while the user has already switched to artist
    // B; the response would land in B's list. Defer.
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
