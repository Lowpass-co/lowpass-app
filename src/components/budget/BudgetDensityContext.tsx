'use client';

/* ============================================
   LOWPASS — Budget density context (Phase B §B4)

   Per-device density preference for the Budget product
   surface. Three modes:

     compact      32px rows · 4px padding · 13px text
     comfortable  44px rows · 8px padding · 14px text  (default)
     cozy         56px rows · 12px padding · 15px text

   Persisted in localStorage under `lowpass:budget:density`.
   Default is Comfortable on first load (no value yet).

   "tight" from the legacy SpreadsheetGrid density prop maps
   to "compact" for backwards compat — callers using the old
   name still get the smaller treatment.

   Token-clean: components consume density via the
   --lp-row-height-{mode}, --lp-cell-font-size-{mode}, etc.
   token set in globals.css.
   ============================================ */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type BudgetDensity = 'compact' | 'comfortable' | 'cozy';

const STORAGE_KEY = 'lowpass:budget:density';
const DEFAULT_DENSITY: BudgetDensity = 'comfortable';

interface BudgetDensityContextValue {
  density: BudgetDensity;
  setDensity: (next: BudgetDensity) => void;
}

const Ctx = createContext<BudgetDensityContextValue | null>(null);

function readStored(): BudgetDensity {
  if (typeof window === 'undefined') return DEFAULT_DENSITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'compact' || raw === 'comfortable' || raw === 'cozy') return raw;
  } catch {
    /* localStorage unavailable (private mode etc.) — fall through */
  }
  return DEFAULT_DENSITY;
}

export function BudgetDensityProvider({ children }: { children: React.ReactNode }) {
  /* SSR-safe init: start with the default; hydrate from
     storage in an effect so server + first client render
     match. Avoids the hydration warning. */
  const [density, setDensityState] = useState<BudgetDensity>(DEFAULT_DENSITY);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe hydration from localStorage (matches §B0/§A3 precedent for client-only persisted state) */
    setDensityState(readStored());
  }, []);

  const setDensity = useCallback((next: BudgetDensity) => {
    setDensityState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore — preference is per-device, ephemeral if blocked */
    }
  }, []);

  return <Ctx.Provider value={{ density, setDensity }}>{children}</Ctx.Provider>;
}

/** Read the current density. Returns 'comfortable' if no
 *  provider is mounted — components consume tokens regardless
 *  so the visual fallback is the new default. */
export function useBudgetDensity(): BudgetDensityContextValue {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return { density: DEFAULT_DENSITY, setDensity: () => undefined };
}
