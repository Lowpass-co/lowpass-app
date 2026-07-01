'use client';

/* ============================================
   LOWPASS — TourEditorProvider + useTourEditor()

   The app-wide host for the ONE tour create/edit modal. Mounted once next to the
   other providers (see (app)/layout.tsx) so any entry point can call
   `useTourEditor().openCreateTour()` / `.openEditTour(id)` without per-page modal
   state. Mirrors the DetailPanel/EntityRouting context pattern.

   - openCreateTour({ artistId? }) — fetches the workspace artists for the picker,
     opens the modal in create mode.
   - openEditTour(id) — fetches the tour's current facts, opens in edit mode.
   ============================================ */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TourEditorModal, type TourArtistOption, type TourEditInitial } from '@/components/shell-v2/TourEditorModal';

interface TourEditorApi {
  openCreateTour: (opts?: { artistId?: string | null }) => void;
  openEditTour: (tourId: string) => void;
}

const TourEditorContext = createContext<TourEditorApi | null>(null);

export function useTourEditor(): TourEditorApi {
  const ctx = useContext(TourEditorContext);
  if (!ctx) throw new Error('useTourEditor must be used within <TourEditorProvider>');
  return ctx;
}

interface State {
  open: boolean;
  mode: 'create' | 'edit';
  artists: TourArtistOption[];
  initialArtistId: string | null;
  tourId?: string;
  editInitial: TourEditInitial | null;
}

const CLOSED: State = { open: false, mode: 'create', artists: [], initialArtistId: null, editInitial: null };

export function TourEditorProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>(CLOSED);

  const openCreateTour = useCallback((opts?: { artistId?: string | null }) => {
    // Open immediately (empty picker), then hydrate artists.
    setState({ open: true, mode: 'create', artists: [], initialArtistId: opts?.artistId ?? null, editInitial: null });
    fetch('/api/artists')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; name: string }>) => {
        const artists = (Array.isArray(data) ? data : []).map((a) => ({ id: a.id, name: a.name }));
        setState((s) => (s.open && s.mode === 'create' ? { ...s, artists } : s));
      })
      .catch(() => {});
  }, []);

  const openEditTour = useCallback((tourId: string) => {
    fetch(`/api/tours/${tourId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: { name?: string; start_date?: string | null; end_date?: string | null; currency?: string | null; continent?: string | null; artist_id?: string | null; artist?: { name?: string } | null } | null) => {
        if (!t) return;
        setState({
          open: true, mode: 'edit', artists: [], initialArtistId: t.artist_id ?? null, tourId,
          editInitial: {
            name: t.name ?? '',
            start_date: t.start_date ?? null,
            end_date: t.end_date ?? null,
            currency: t.currency ?? null,
            continent: t.continent ?? null,
            artist_id: t.artist_id ?? null,
            artist_name: t.artist?.name ?? null,
          },
        });
      })
      .catch(() => {});
  }, []);

  const close = useCallback(() => setState(CLOSED), []);

  const api = useMemo<TourEditorApi>(() => ({ openCreateTour, openEditTour }), [openCreateTour, openEditTour]);

  return (
    <TourEditorContext.Provider value={api}>
      {children}
      <TourEditorModal
        open={state.open}
        mode={state.mode}
        artists={state.artists}
        initialArtistId={state.initialArtistId}
        tourId={state.tourId}
        editInitial={state.editInitial}
        onClose={close}
        onSaved={(tour) => {
          router.refresh();
          if (state.mode === 'create') router.push(`/operations/${tour.id}`);
        }}
      />
    </TourEditorContext.Provider>
  );
}
