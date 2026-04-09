'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Artist, Tour } from '@/types';

const STORAGE_ARTIST = 'lp-selected-artist';
const STORAGE_TOUR = 'lp-selected-tour';

interface ArtistTourContextType {
  selectedArtistId: string | null;
  selectedTourId: string | null;
  selectedArtist: Artist | null;
  selectedTour: Tour | null;
  setSelectedArtistId: (id: string | null) => void;
  setSelectedTourId: (id: string | null) => void;
  artists: Artist[];
  tours: Tour[];
  isLoading: boolean;
  /** True once localStorage has been read — prevents artist-picker flashing on load */
  hydrated: boolean;
}

const ArtistTourContext = createContext<ArtistTourContextType | null>(null);

export function useArtistTourContext() {
  const ctx = useContext(ArtistTourContext);
  if (!ctx) {
    throw new Error('useArtistTourContext must be used within ArtistTourProvider');
  }
  return ctx;
}

export function ArtistTourProvider({ children }: { children: ReactNode }) {
  const [selectedArtistId, setSelectedArtistIdState] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourIdState] = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsLoaded, setArtistsLoaded] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const a = localStorage.getItem(STORAGE_ARTIST);
    const t = localStorage.getItem(STORAGE_TOUR);
    if (a) setSelectedArtistIdState(a);
    if (t) setSelectedTourIdState(t);
    setHydrated(true);
  }, []);

  const setSelectedArtistId = useCallback((id: string | null) => {
    setSelectedArtistIdState(id);
    setSelectedTourIdState(null);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_ARTIST, id);
      else localStorage.removeItem(STORAGE_ARTIST);
      localStorage.removeItem(STORAGE_TOUR);
    }
  }, []);

  const setSelectedTourId = useCallback((id: string | null) => {
    setSelectedTourIdState(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_TOUR, id);
      else localStorage.removeItem(STORAGE_TOUR);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artists')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setArtists(data);
      })
      .catch(() => { if (!cancelled) setArtists([]); })
      .finally(() => { if (!cancelled) setArtistsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
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
  }, [selectedArtistId]);

  const selectedArtist = selectedArtistId ? artists.find((a) => a.id === selectedArtistId) ?? null : null;
  const selectedTour = selectedTourId ? tours.find((t) => t.id === selectedTourId) ?? null : null;

  useEffect(() => {
    if (!selectedArtistId || !artistsLoaded) return;
    if (!artists.some((a) => a.id === selectedArtistId)) {
      setSelectedArtistId(null);
    }
  }, [artists, artistsLoaded, selectedArtistId, setSelectedArtistId]);

  useEffect(() => {
    if (!selectedTourId || !selectedArtistId) return;
    if (isLoading) return;
    if (!tours.some((t) => t.id === selectedTourId)) {
      setSelectedTourId(null);
    }
  }, [tours, selectedTourId, selectedArtistId, isLoading, setSelectedTourId]);

  const value: ArtistTourContextType = {
    selectedArtistId,
    selectedTourId,
    selectedArtist,
    selectedTour,
    setSelectedArtistId,
    setSelectedTourId,
    artists,
    tours,
    isLoading,
    hydrated,
  };

  return (
    <ArtistTourContext.Provider value={value}>
      {children}
    </ArtistTourContext.Provider>
  );
}
