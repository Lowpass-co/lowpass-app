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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArtistTourSwitcher } from './ArtistTourSwitcher';
import { TourCreateSlideOver } from './TourCreateSlideOver';
import { ArtistCreateSlideOver } from './ArtistCreateSlideOver';
import { TourDeleteConfirmationModal } from './TourDeleteConfirmationModal';
import { ArtistDeleteConfirmationModal } from '@/components/artists/ArtistDeleteConfirmationModal';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useSwitcherState } from '@/contexts/SwitcherStateContext';

export type ArtistMin = {
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
  const router = useRouter();
  const pathname = usePathname();
  const [isCreateTourOpen, setIsCreateTourOpen] = useState(false);
  // Sprint 8 §5 — artist creation slide-over state, parallel
  // to the tour creation state above.
  const [isCreateArtistOpen, setIsCreateArtistOpen] = useState(false);
  // Sprint 8.1 §5 — tour deletion modal state. The wrapper owns
  // the modal so the switcher itself can stay focused on its
  // navigation role; opens via the per-row ⋮ menu.
  const [tourToDelete, setTourToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Sprint 8.4 §3 — artist deletion modal state, mirror of
  // tourToDelete. Opens via the switcher's per-row ⋮ menu.
  const [artistToDelete, setArtistToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Optimistic-prepend list of newly-created artists.
  //
  // Sprint 8.3 §1 — moved out of local useState into the
  // workspace-level <SwitcherStateProvider> so the list survives
  // the wrapper remount that fires on /artists/[new-id] navigation
  // (Next 16 RSC remounts everything below the dynamic segment).
  // Replaces Sprint 8.2 §3's sessionStorage rehydration which
  // worked but kept the wrapper remounting; with state in a
  // never-unmounting provider, no rehydration needed.
  //
  // Entries age out naturally — once the server-side ProductHeader
  // fetch returns the new artist in initialArtists, mergedArtists
  // below dedupes by id so the same artist doesn't appear twice.
  const { createdArtists, setCreatedArtists } = useSwitcherState();

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

  // Sprint 7 §1.B — when the server-side initialTours prop
  // changes (e.g. after router.push to a new tour-scoped URL
  // following tour creation), merge it into local state. Any
  // optimistic-only entries (created locally but not yet in
  // the server response) are preserved by id-set diff.
  // Without this, the wrapper's local `tours` lags behind
  // the server fetch on cross-product nav, and the trigger
  // shows "Pick a tour…" until manual refresh.
  useEffect(() => {
    queueMicrotask(() => {
      setTours((prev) => {
        const incomingIds = new Set(initialTours?.map((t) => t.id) ?? []);
        const optimisticOnly = prev.filter((t) => !incomingIds.has(t.id));
        return [...optimisticOnly, ...(initialTours ?? [])];
      });
    });
  }, [initialTours]);

  const handleTourCreated = useCallback(
    (tour: TourMin) => {
      // Optimistic prepend so the new tour appears in the
      // switcher's tours pane immediately. Edge case noted for
      // a future sprint: a stale slide-over closure could in
      // theory POST for artist A while the user has already
      // switched to artist B; the response would land in B's
      // list. Defer.
      setTours((prev) => [tour, ...prev]);

      // Sprint 6.2 §4 — navigate to the new tour's surface so
      // the page actually reflects the new selection. Without
      // this, the slide-over would close but the page would
      // stay on the previous tour (or artist home), and the
      // user would have to manually click the new tour in the
      // switcher to navigate. Adam's smoke: "PASS - but could
      // only select the tour in the picker after refresh."
      //
      // Mirrors the product-match logic in handleTourClick.
      // Path-aware hydration on the new URL handles the
      // selectedTourId state update — no explicit setter call
      // needed (the slide-over previously called
      // setSelectedTourId which fired a syncUrlParams
      // router.replace racing the navigation; that's been
      // removed in this sprint too).
      const productMatch = pathname?.match(
        /^\/(budget|advance|operations)\//,
      );
      if (productMatch) {
        router.push(`/${productMatch[1]}/${tour.id}`);
        return;
      }
      if (pathname?.startsWith('/artists/')) {
        router.push(`/budget/${tour.id}`);
        return;
      }
      // Other paths — keep the new tour in the list, no forced
      // navigation. User can pick it from the switcher.
    },
    [pathname, router],
  );

  // Sprint 8 §5 — artist creation success path. Prepend the new
  // artist to local state so the switcher's artists pane shows
  // it immediately, then navigate to its workspace surface so
  // the user lands on the new artist.
  const handleArtistCreated = useCallback(
    (artist: ArtistMin) => {
      setCreatedArtists((prev) => [artist, ...prev]);
      router.push(`/artists/${artist.id}`);
    },
    [router, setCreatedArtists],
  );

  // Sprint 8.1 §5 — tour deletion success path. Optimistically
  // remove the deleted tour from the local list so the switcher
  // doesn't show a stale row, then navigate the user to the
  // artist landing (which is always a safe destination — never
  // tour-scoped, so no broken-URL state).
  const handleTourDeleted = useCallback(() => {
    if (!tourToDelete) return;
    const deletedId = tourToDelete.id;
    setTours((prev) => prev.filter((t) => t.id !== deletedId));
    setTourToDelete(null);
    // Sprint 8.2 §6 — invalidate the workspace landing's
    // server-rendered cache so the Pick Up Where You Left Off
    // card no longer surfaces the deleted tour. router.refresh()
    // re-fetches data on the current route in the next render
    // pass; combined with the navigation below for the on-tour-
    // URL case, the next visit to /artists also lands on fresh
    // data.
    router.refresh();
    // Navigate away if we're currently ON the deleted tour's URL.
    // Detect via /budget/[id], /advance/[id], /operations/[id].
    const productMatch = pathname?.match(
      new RegExp(`^/(budget|advance|operations)/${deletedId}(/|$)`),
    );
    if (productMatch && selectedArtistId) {
      router.push(`/artists/${selectedArtistId}`);
    } else if (productMatch) {
      router.push('/artists');
    }
  }, [tourToDelete, pathname, router, selectedArtistId]);

  // Sprint 8.4 §3 — artist deletion success path. Mirror of
  // tourToDelete: optimistically scrub the artist from the
  // local createdArtists list (in case the deleted artist was
  // there), invalidate cache, navigate to /artists.
  const handleArtistDeleted = useCallback(() => {
    if (!artistToDelete) return;
    const deletedId = artistToDelete.id;
    setCreatedArtists((prev) => prev.filter((a) => a.id !== deletedId));
    setArtistToDelete(null);
    router.refresh();
    // Navigate away from any URL scoped to this artist (or its
    // tours). Safe destination: workspace landing.
    router.push('/artists');
  }, [artistToDelete, router, setCreatedArtists]);

  // Merge: optimistic creates first, then the server-fetched
  // list (de-duped by id). Keeps newly-created artists at the
  // top of the switcher's pane until the next page-level refetch.
  const mergedArtists = useMemo<ArtistMin[]>(() => {
    if (createdArtists.length === 0) return initialArtists;
    const seen = new Set(createdArtists.map((a) => a.id));
    return [
      ...createdArtists,
      ...initialArtists.filter((a) => !seen.has(a.id)),
    ];
  }, [createdArtists, initialArtists]);

  // Lean projection for the tour slide-over's artist picker
  // fallback — only id+name needed.
  const tourArtistOptions = useMemo(
    () => mergedArtists.map((a) => ({ id: a.id, name: a.name })),
    [mergedArtists],
  );

  return (
    <>
      <ArtistTourSwitcher
        initialArtists={mergedArtists}
        tours={tours}
        toursLoading={toursLoading}
        onCreateTour={() => setIsCreateTourOpen(true)}
        onCreateArtist={() => setIsCreateArtistOpen(true)}
        onDeleteTour={(tour) => setTourToDelete(tour)}
        onDeleteArtist={(artist) => setArtistToDelete(artist)}
      />
      <TourCreateSlideOver
        open={isCreateTourOpen}
        onClose={() => setIsCreateTourOpen(false)}
        artists={tourArtistOptions}
        onCreated={handleTourCreated}
      />
      <ArtistCreateSlideOver
        open={isCreateArtistOpen}
        onClose={() => setIsCreateArtistOpen(false)}
        onCreated={handleArtistCreated}
      />
      {tourToDelete ? (
        <TourDeleteConfirmationModal
          open
          tourId={tourToDelete.id}
          tourName={tourToDelete.name}
          onClose={() => setTourToDelete(null)}
          onDeleted={handleTourDeleted}
        />
      ) : null}
      {artistToDelete ? (
        <ArtistDeleteConfirmationModal
          open
          artistId={artistToDelete.id}
          artistName={artistToDelete.name}
          onClose={() => setArtistToDelete(null)}
          onDeleted={handleArtistDeleted}
        />
      ) : null}
    </>
  );
}
