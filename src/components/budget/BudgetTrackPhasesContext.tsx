/* ============================================
   LOWPASS — Budget track-phases shared client state (Phase 4.2)

   The phase toggle lives in the Settings tab; the phase strip lives
   above the tabs. They share this client context so flipping the toggle
   animates the strip (BudgetPhaseStripReveal) WITHOUT a router.refresh —
   the new value persists in the background. Seeded once from the server
   value; survives soft tab navigations (useState initializer runs once).
   ============================================ */

'use client';

import { createContext, useContext, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

interface TrackPhasesCtx {
  trackPhases: boolean;
  setTrackPhases: (next: boolean) => void;
  busy: boolean;
}

const Ctx = createContext<TrackPhasesCtx | null>(null);

export function BudgetTrackPhasesProvider({
  tourId,
  initial,
  children,
}: {
  tourId: string;
  initial: boolean;
  children: React.ReactNode;
}) {
  const { showToast } = useToast();
  const [trackPhases, setState] = useState(initial);
  const [busy, setBusy] = useState(false);

  const setTrackPhases = (next: boolean) => {
    setState(next); // optimistic — animates the strip immediately
    setBusy(true);
    void (async () => {
      try {
        const res = await fetch('/api/budget/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, track_phases: next }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
      } catch (err) {
        setState(!next); // roll back
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Ctx.Provider value={{ trackPhases, setTrackPhases, busy }}>
      {children}
    </Ctx.Provider>
  );
}

/** Read the shared track-phases state. Falls back to a static value when
 *  used outside the provider (defensive — components still render). */
export function useTrackPhases(fallback = false): TrackPhasesCtx {
  return (
    useContext(Ctx) ?? {
      trackPhases: fallback,
      setTrackPhases: () => {},
      busy: false,
    }
  );
}
