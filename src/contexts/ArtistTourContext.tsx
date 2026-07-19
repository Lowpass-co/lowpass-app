'use client';

import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Artist, Tour } from '@/types';

/* This provider's entire job is to DERIVE React state from external sources —
 * the URL (path + query), localStorage, and async /api fetches. Setting state
 * inside effects is the correct pattern here (there's nothing to derive during
 * render), so react-hooks/set-state-in-effect is disabled file-wide rather than
 * peppering every sync/load effect with line-level disables (the file already
 * carried these; §A4 formalises it). */
/* eslint-disable react-hooks/set-state-in-effect */

const STORAGE_ARTIST = 'lp-selected-artist';
const STORAGE_TOUR = 'lp-selected-tour';
// Post-merge fix-up §C — URL params are the canonical source of
// truth for artist + tour. localStorage is a fallback for first-load
// when no URL params present.
const QUERY_ARTIST = 'artist_id';
const QUERY_TOUR = 'tour_id';

export type TourRoutingLiteRow = {
  id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
};

interface ArtistTourContextType {
  selectedArtistId: string | null;
  selectedTourId: string | null;
  selectedArtist: Artist | null;
  selectedTour: Tour | null;
  setSelectedArtistId: (id: string | null) => void;
  setSelectedTourId: (id: string | null) => void;
  /** A4 — the localStorage "last visited" artist/tour, kept SEPARATE from the
   *  URL-derived selection above. Resume redirects (bare /budget → /budget/[id])
   *  read these; the picker pills read selectedArtistId/selectedTourId, which are
   *  URL-only so a workspace tab never shows a stale selection. */
  resumeArtistId: string | null;
  resumeTourId: string | null;
  artists: Artist[];
  tours: Tour[];
  isLoading: boolean;
  /** True once localStorage has been read — prevents artist-picker flashing on load */
  hydrated: boolean;
  /** True after initial GET /api/artists completes (success or fail) */
  artistsLoaded: boolean;
  tourRouting: TourRoutingLiteRow[];
  isRoutingLoading: boolean;
  /** Reload artists from the server (e.g. after creating one). */
  refetchArtists: () => Promise<void>;
  /** P0 — a tour URL (/operations|budget|advance/[tourId]) does NOT carry the
   *  artist id, so the picker sat empty on a cold load. Tour layouts know the
   *  artist server-side and feed it here; the URL resolver then hydrates the
   *  artist selection for that tour. */
  provideTourArtist: (tourId: string, artistId: string | null) => void;
}

const ArtistTourContext = createContext<ArtistTourContextType | null>(null);

/** Extract a tour UUID from /budget/[uuid], /advance/[uuid], or
 *  /operations/[uuid] paths. Returns null for any other path. */
function extractTourIdFromPath(pathname: string): string | null {
  const m = pathname.match(
    /^\/(?:budget|advance|operations)\/([^/?#]+)/,
  );
  // Skip path-segment lookups when the segment is a known
  // non-UUID landing slug. Add to this list as new dynamic
  // routes appear; the canonical cases today are tour UUIDs.
  if (!m) return null;
  const candidate = m[1];
  if (!candidate) return null;
  return candidate;
}

/** Extract an artist UUID from /artists/[uuid] paths. */
function extractArtistIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/artists\/([^/?#]+)/);
  return m?.[1] ?? null;
}

export function useArtistTourContext() {
  const ctx = useContext(ArtistTourContext);
  if (!ctx) {
    throw new Error('useArtistTourContext must be used within ArtistTourProvider');
  }
  return ctx;
}

export function ArtistTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  // Snapshot URL params at render time. Reading them inside state-init
  // would require a lazy initializer + useState comparison; the
  // useLayoutEffect below picks them up synchronously before paint
  // (and reacts when they change in-app via the deps array).
  const urlArtistId = urlSearchParams?.get(QUERY_ARTIST) ?? null;
  const urlTourId = urlSearchParams?.get(QUERY_TOUR) ?? null;

  const [selectedArtistId, setSelectedArtistIdState] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourIdState] = useState<string | null>(null);
  // A4 — the localStorage-backed "resume" ids, kept out of the pill selection.
  const [resumeArtistId, setResumeArtistId] = useState<string | null>(null);
  const [resumeTourId, setResumeTourId] = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsLoaded, setArtistsLoaded] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tourRouting, setTourRouting] = useState<TourRoutingLiteRow[]>([]);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  // P0 — server-provided tourId → artistId map (tour URLs don't carry the artist).
  const [tourArtistMap, setTourArtistMap] = useState<Record<string, string>>({});
  const provideTourArtist = useCallback((tourId: string, artistId: string | null) => {
    if (!tourId || !artistId) return;
    setTourArtistMap((prev) => (prev[tourId] === artistId ? prev : { ...prev, [tourId]: artistId }));
  }, []);

  // Post-merge fix-up §C + Hotfix 4 §1 — resolution order:
  //   1. ?artist_id / ?tour_id present in URL → use them
  //   2. Path segment (e.g. /budget/[tourId], /artists/[id]) →
  //      use that. This is the Hotfix 4 fix: previously stale
  //      localStorage could override the path the user was actually
  //      on, surfacing as cross-artist navigation.
  //   3. localStorage (first-load fallback)
  //   4. Otherwise, null
  // Runs in useLayoutEffect so the swap happens before paint, killing
  // the race where users navigating fast hit pages before localStorage
  // hydration completes.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const lsArtist = localStorage.getItem(STORAGE_ARTIST);
    const lsTour = localStorage.getItem(STORAGE_TOUR);
    const pathArtist = pathname ? extractArtistIdFromPath(pathname) : null;
    const pathTour = pathname ? extractTourIdFromPath(pathname) : null;
    // A4 — the PILL selection is URL ONLY (query → path → null). Dropping the
    // localStorage fallback is what stops workspace tabs from silently showing a
    // stale artist/tour. The localStorage value still lives on as the separate
    // `resume*` ids (below) so bare-product resume redirects keep working.
    // P0 — on a tour page the artist isn't in the URL; fall back to the
    // server-provided tour→artist map so the picker hydrates on a cold load.
    const nextArtist = urlArtistId ?? pathArtist ?? (pathTour ? tourArtistMap[pathTour] ?? null : null);
    const nextTour = urlTourId ?? pathTour ?? null;
    setSelectedArtistIdState((prev) => (prev === nextArtist ? prev : nextArtist));
    setSelectedTourIdState((prev) => (prev === nextTour ? prev : nextTour));
    setHydrated(true);
    // Resume ids track the last-known localStorage value, updated whenever the
    // URL names a fresh selection (write-back below). Seed from localStorage on
    // mount so the resume redirects have the previous session's tour immediately.
    setResumeArtistId(nextArtist ?? lsArtist ?? null);
    setResumeTourId(nextTour ?? lsTour ?? null);
    // Write the URL-resolved values back to localStorage so "resume" always
    // reflects the most recently visited artist/tour. Only write real values.
    if (nextArtist && nextArtist !== lsArtist) {
      localStorage.setItem(STORAGE_ARTIST, nextArtist);
    }
    if (nextTour && nextTour !== lsTour) {
      localStorage.setItem(STORAGE_TOUR, nextTour);
    }
  }, [urlArtistId, urlTourId, pathname, tourArtistMap]);

  // Helper: write the current selection back to the URL via
  // router.replace, preserving everything else in the search string.
  // Path-segment routes like /budget/[tourId] already encode the tour;
  // adding it as a query param too is harmless and lets shared
  // utilities deep-link with full state.
  const syncUrlParams = useCallback(
    (artistId: string | null, tourId: string | null) => {
      if (typeof window === 'undefined' || !pathname) return;
      const next = new URLSearchParams(urlSearchParams?.toString() ?? '');
      if (artistId) next.set(QUERY_ARTIST, artistId);
      else next.delete(QUERY_ARTIST);
      if (tourId) next.set(QUERY_TOUR, tourId);
      else next.delete(QUERY_TOUR);
      const qs = next.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      // Skip the replace when it would no-op — avoids fighting Next's
      // own back/forward handling.
      const current =
        window.location.pathname +
        (window.location.search ? window.location.search : '');
      if (target !== current) {
        router.replace(target, { scroll: false });
      }
    },
    [pathname, router, urlSearchParams],
  );

  const setSelectedArtistId = useCallback(
    (id: string | null) => {
      setSelectedArtistIdState(id);
      // Picking a new artist clears the tour selection (a tour belongs
      // to one artist; switching the artist invalidates the tour).
      setSelectedTourIdState(null);
      setResumeArtistId(id);
      setResumeTourId(null);
      if (typeof window !== 'undefined') {
        if (id) localStorage.setItem(STORAGE_ARTIST, id);
        else localStorage.removeItem(STORAGE_ARTIST);
        localStorage.removeItem(STORAGE_TOUR);
      }
      syncUrlParams(id, null);
    },
    [syncUrlParams],
  );

  const setSelectedTourId = useCallback(
    (id: string | null) => {
      setSelectedTourIdState(id);
      if (id) setResumeTourId(id);
      if (typeof window !== 'undefined') {
        if (id) localStorage.setItem(STORAGE_TOUR, id);
        else localStorage.removeItem(STORAGE_TOUR);
      }
      // Use the latest selectedArtistId for the URL write — the closure
      // captures whatever was current when the callback was constructed,
      // so we read from state instead.
      setSelectedArtistIdState((currentArtist) => {
        syncUrlParams(currentArtist, id);
        return currentArtist;
      });
    },
    [syncUrlParams],
  );

  const fetchArtistsList = useCallback(async (): Promise<Artist[]> => {
    try {
      const r = await fetch('/api/artists');
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchArtistsList()
      .then((list) => {
        if (!cancelled) setArtists(list);
      })
      .finally(() => {
        if (!cancelled) setArtistsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchArtistsList]);

  const refetchArtists = useCallback(async () => {
    const list = await fetchArtistsList();
    setArtists(list);
  }, [fetchArtistsList]);

  useEffect(() => {
    if (!hydrated) return;
    if (!selectedArtistId) {
      setTours([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/tours?limit=200')
      .then((r) => (r.ok ? r.json() : { tours: [] }))
      .then((data) => {
        const list = Array.isArray(data?.tours) ? data.tours : [];
        const forArtist = list.filter((t: Tour) => t.artist_id === selectedArtistId);
        if (!cancelled) {
          setTours(forArtist);
        }
      })
      .catch(() => { if (!cancelled) setTours([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [hydrated, selectedArtistId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!selectedTourId) {
      setTourRouting([]);
      setIsRoutingLoading(false);
      return;
    }
    let cancelled = false;
    setIsRoutingLoading(true);
    fetch(`/api/tours/${selectedTourId}/routing?lite=1`)
      .then((r) => (r.ok ? r.json() : { routing: [] }))
      .then((data: { routing?: TourRoutingLiteRow[] }) => {
        const list = data?.routing;
        if (!cancelled && Array.isArray(list)) {
          setTourRouting(list);
        }
      })
      .catch(() => {
        if (!cancelled) setTourRouting([]);
      })
      .finally(() => {
        if (!cancelled) setIsRoutingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, selectedTourId]);

  const selectedArtist = selectedArtistId ? artists.find((a) => a.id === selectedArtistId) ?? null : null;
  const selectedTour = selectedTourId ? tours.find((t) => t.id === selectedTourId) ?? null : null;

  useEffect(() => {
    if (!selectedArtistId || !artistsLoaded) return;
    // A4 (NAV-08) — the URL PATH is authoritative. Never null a selection the
    // path asserts (e.g. you're ON /artists/[id]) just because the artists list
    // fetch is still loading or came back short — that's what emptied the pill
    // ("Pick an artist…") while inside an artist page. Only stale, non-path
    // selections (a leftover localStorage id on a page that doesn't name it) get
    // reset.
    if (pathname && extractArtistIdFromPath(pathname) === selectedArtistId) return;
    if (!artists.some((a) => a.id === selectedArtistId)) {
      setSelectedArtistId(null);
    }
  }, [artists, artistsLoaded, selectedArtistId, setSelectedArtistId, pathname]);

  useEffect(() => {
    if (!selectedTourId || !selectedArtistId) return;
    if (isLoading) return;
    // A4 (NAV-08) — same rule for the tour: a tour named by the path
    // (/operations|/budget|/advance/[tourId]) stays selected regardless of the
    // tours-list fetch, so the tour pill reflects the URL on every tour page.
    if (pathname && extractTourIdFromPath(pathname) === selectedTourId) return;
    if (!tours.some((t) => t.id === selectedTourId)) {
      setSelectedTourId(null);
    }
  }, [tours, selectedTourId, selectedArtistId, isLoading, setSelectedTourId, pathname]);

  const value: ArtistTourContextType = {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    selectedTour,
    setSelectedArtistId,
    setSelectedTourId,
    resumeArtistId,
    resumeTourId,
    artists,
    tours,
    isLoading,
    hydrated,
    artistsLoaded,
    tourRouting,
    isRoutingLoading,
    refetchArtists,
    provideTourArtist,
  };

  return (
    <ArtistTourContext.Provider value={value}>
      {children}
    </ArtistTourContext.Provider>
  );
}
