/* ============================================
   LOWPASS — Phase 0 ProductRail PREVIEW

   Placeholder version for the /playground/new-home preview only.
   Phase 1 ships the canonical <ProductRail> in src/components/shell/
   with full nav wiring + active-state resolution from the URL.

   Visual reference matches the Idea 3 mockup: 56px-wide vertical
   rail, dark deep-bg, brand-orange accent on the active product.
   Icons via lucide-react (already installed). Static for now —
   clicks log to console rather than navigate, since Phase 0 only
   has the Home reference page mounted.
   ============================================ */

'use client';

import { Briefcase, ClipboardList, DollarSign, Home, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRODUCTS = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'operations', label: 'Operations', Icon: Briefcase },
  { key: 'budget', label: 'Budget', Icon: DollarSign },
  { key: 'advance', label: 'Advance', Icon: ClipboardList },
] as const;

export function HomeProductRailPreview({
  active,
}: {
  active: 'home' | 'operations' | 'budget' | 'advance' | 'settings' | null;
}) {
  return (
    <div
      className="lp-product-rail-preview flex shrink-0 flex-col items-center gap-1 border-r py-3"
      style={{
        width: 56,
        background: 'var(--lp-bg-deep, var(--lp-bg))',
        borderColor: 'var(--lp-border-strong, var(--lp-border))',
      }}
      aria-label="Product navigation"
    >
      {PRODUCTS.map((p) => {
        const isActive = active === p.key;
        return (
          <button
            key={p.key}
            type="button"
            className={cn(
              'btn-transition flex h-10 w-10 items-center justify-center rounded-md',
            )}
            style={{
              background: isActive
                ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
                : 'transparent',
              color: isActive ? 'var(--color-lp-orange)' : 'var(--lp-text-tertiary)',
            }}
            title={p.label}
            aria-label={p.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              // Phase 0 placeholder: real navigation lands in Phase 1.
              // No-op in this preview so we don't spam the console.
            }}
          >
            <p.Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          className="btn-transition flex h-10 w-10 items-center justify-center rounded-md"
          style={{ color: 'var(--lp-text-tertiary)' }}
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
