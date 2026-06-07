'use client';

/* ============================================
   LOWPASS — <BudgetDensityToggle> (Phase B §B4.2)

   Three-button density picker mounted at the far right of
   BudgetTabNav. Each button is a small icon labelled by
   horizontal-line metaphor:

     ☰  Compact      tight rows
     ≡  Comfortable  default
     ☷  Cozy         roomy rows

   The active button gets a brand-orange tint; hover state
   matches the rest of the tab nav.

   Persistence happens in BudgetDensityContext —
   localStorage `lowpass:budget:density`.
   ============================================ */

import { Rows3, Rows4, Menu } from 'lucide-react';
import { useBudgetDensity, type BudgetDensity } from './BudgetDensityContext';

const OPTIONS: ReadonlyArray<{
  value: BudgetDensity;
  label: string;
  Icon: typeof Rows3;
}> = [
  { value: 'compact', label: 'Compact', Icon: Rows4 },
  { value: 'comfortable', label: 'Comfortable', Icon: Rows3 },
  { value: 'cozy', label: 'Spacious', Icon: Menu },
];

export function BudgetDensityToggle() {
  const { density, setDensity } = useBudgetDensity();
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
      {OPTIONS.map((o) => {
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
