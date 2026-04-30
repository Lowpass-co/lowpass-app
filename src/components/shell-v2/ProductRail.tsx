/* ============================================
   LOWPASS — Product Split Phase 1 — <ProductRail>

   Left icon-only rail, 56px wide. The four-product split's primary
   navigation. Lives alongside the existing src/components/shell/LeftRail
   until Phases 2-4 cut each product over.

   API:
     <ProductRail active="home" | "operations" | "budget" | "advance" />

   Active product gets brand-orange tinted background; others muted.
   Click navigates to the product's root route. Settings sits at the
   bottom; the avatar dropdown still lives in <ProductHeader>.
   ============================================ */

'use client';

import Link from 'next/link';
import {
  Briefcase,
  ClipboardList,
  DollarSign,
  House,
  Settings,
} from 'lucide-react';
import { useEntitlements } from '@/lib/entitlements';

export type ProductRailActive = 'home' | 'operations' | 'budget' | 'advance';

interface ProductDef {
  key: ProductRailActive;
  label: string;
  href: string;
  Icon: typeof House;
  /** Entitlement flag key; rail item only renders if this is true. */
  flag: keyof ReturnType<typeof useEntitlements>;
}

const PRODUCTS: ReadonlyArray<ProductDef> = [
  { key: 'home', label: 'Home', href: '/', Icon: House, flag: 'home' },
  {
    key: 'operations',
    label: 'Operations',
    href: '/operations',
    Icon: Briefcase,
    flag: 'operations',
  },
  {
    key: 'budget',
    label: 'Budget',
    href: '/budget',
    Icon: DollarSign,
    flag: 'budget',
  },
  {
    key: 'advance',
    label: 'Advance',
    href: '/advance',
    Icon: ClipboardList,
    flag: 'advance',
  },
];

interface ProductRailProps {
  active: ProductRailActive;
  /** Optional override for the Home href (e.g. when an artist is selected,
      Home actually lives at `/artists/[artistId]`). */
  homeHref?: string;
}

export function ProductRail({ active, homeHref }: ProductRailProps) {
  const entitlements = useEntitlements();

  return (
    <nav
      className="lp-product-rail flex shrink-0 flex-col items-center gap-1 border-r py-3"
      style={{
        width: 56,
        background: 'var(--lp-bg-deep)',
        borderColor: 'var(--lp-border-strong)',
      }}
      aria-label="Product navigation"
    >
      {PRODUCTS.map((p) => {
        if (!entitlements[p.flag]) return null;
        const isActive = active === p.key;
        const href = p.key === 'home' && homeHref ? homeHref : p.href;
        return (
          <Link
            key={p.key}
            href={href}
            className="btn-transition flex h-10 w-10 items-center justify-center rounded-md"
            style={{
              background: isActive
                ? 'color-mix(in srgb, var(--color-lp-orange) 8%, transparent)'
                : 'transparent',
              color: isActive
                ? 'var(--color-lp-orange)'
                : 'var(--lp-text-tertiary)',
            }}
            title={p.label}
            aria-label={p.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <p.Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Link
          href="/settings"
          className="btn-transition flex h-10 w-10 items-center justify-center rounded-md"
          style={{ color: 'var(--lp-text-tertiary)' }}
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    </nav>
  );
}
