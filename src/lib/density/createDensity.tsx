'use client';

/* ============================================
   LOWPASS — Density factory (Phase B §B5)

   Generalised version of the Budget §B4 density context.
   Each surface (Budget / Equipment / Personnel grids) gets
   its own bound context + hook + provider + toggle via:

     const { Provider, useDensity, Toggle } = createDensity({
       storageKey: 'lowpass:equipment:density',
       defaultDensity: 'comfortable',
     });

   Each surface persists independently — Equipment can be
   Cozy while Budget stays Comfortable. The tokens that
   drive cell styling live in globals.css and are shared
   (--lp-row-cell-padding-y-{mode}, --lp-cell-font-size-
   {mode}, --lp-cell-numeric-size-{mode}, ...).

   Components consume density either via the bound
   useDensity hook OR via the `data-lp-density="..."` attr
   the Provider sets on its root <div>; globals.css ships
   ancestor-scoped rules so any descendant <td> picks up
   the right padding + font without prop drilling.
   ============================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Menu, Rows3, Rows4 } from 'lucide-react';

export type Density = 'compact' | 'comfortable' | 'cozy';

interface DensityContextValue {
  density: Density;
  setDensity: (next: Density) => void;
}

interface CreateDensityOptions {
  storageKey: string;
  defaultDensity?: Density;
}

interface DensityBinding {
  Provider: (props: { children: ReactNode }) => React.JSX.Element;
  useDensity: () => DensityContextValue;
  Toggle: () => React.JSX.Element;
}

export function createDensity({
  storageKey,
  defaultDensity = 'comfortable',
}: CreateDensityOptions): DensityBinding {
  const Ctx = createContext<DensityContextValue | null>(null);

  function readStored(): Density {
    if (typeof window === 'undefined') return defaultDensity;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === 'compact' || raw === 'comfortable' || raw === 'cozy') return raw;
    } catch {
      /* localStorage blocked (private mode etc.) */
    }
    return defaultDensity;
  }

  function Provider({ children }: { children: ReactNode }) {
    const [density, setDensityState] = useState<Density>(defaultDensity);

    useEffect(() => {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe hydration from localStorage (matches §B4 BudgetDensityContext precedent) */
      setDensityState(readStored());
    }, []);

    const setDensity = useCallback((next: Density) => {
      setDensityState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* ignore — preference is per-device, ephemeral if blocked */
      }
    }, []);

    return (
      <Ctx.Provider value={{ density, setDensity }}>
        {/* data-lp-density on a wrapping div lets globals.css
            scope cell-sizing rules without prop-drilling. */}
        <div data-lp-density={density} style={{ display: 'contents' }}>
          {children}
        </div>
      </Ctx.Provider>
    );
  }

  function useDensity(): DensityContextValue {
    const ctx = useContext(Ctx);
    if (ctx) return ctx;
    return { density: defaultDensity, setDensity: () => undefined };
  }

  function Toggle() {
    const { density, setDensity } = useDensity();
    const options: ReadonlyArray<{ value: Density; label: string; Icon: typeof Rows3 }> = [
      { value: 'compact', label: 'Compact', Icon: Rows4 },
      { value: 'comfortable', label: 'Comfortable', Icon: Rows3 },
      { value: 'cozy', label: 'Spacious', Icon: Menu },
    ];
    return (
      <div
        role="group"
        aria-label="Row density"
        className="flex items-center gap-0.5 rounded-md border px-0.5 py-0.5"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg)',
        }}
      >
        {options.map((o) => {
          const active = density === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setDensity(o.value)}
              aria-label={o.label}
              aria-pressed={active}
              title={o.label}
              className="btn-transition inline-flex items-center justify-center rounded px-1.5 py-1"
              style={{
                color: active ? 'var(--color-lp-orange)' : 'var(--lp-text-secondary)',
                background: active
                  ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
                  : 'transparent',
              }}
            >
              <o.Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.25 : 1.75} />
            </button>
          );
        })}
      </div>
    );
  }

  return { Provider, useDensity, Toggle };
}
