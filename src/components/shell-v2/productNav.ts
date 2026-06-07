/* ============================================
   LOWPASS — Product nav model (two-bar shell)

   Single source for the top product bar (Bar 1) AND the per-product
   hover-dropdown shortcuts. Pure data (NO 'use client') so server and
   client both import it.

   - PRODUCTS: the four-product split + their roots, icons, entitlement
     flag, and tour-scope rule (moved here from ProductRail so the rail
     can be deleted without breaking the type).
   - getProductSubItems(): the Bar-2 items for a product, used to build
     the one-load hover-dropdown on Bar 1. Same labels/routes the page's
     own Bar-2 sub-nav renders.
   ============================================ */

import {
  Briefcase,
  ClipboardList,
  DollarSign,
  House,
  type LucideIcon,
} from 'lucide-react';
import type { Entitlements } from '@/lib/entitlements';

/* `null` is the "neutral chrome" state (Settings / Venues / Bugs):
   the bar still renders, but no product is highlighted. */
export type ProductRailActive = 'home' | 'operations' | 'budget' | 'advance' | null;

export interface ProductDef {
  key: Exclude<ProductRailActive, null>;
  label: string;
  href: string;
  Icon: LucideIcon;
  flag: keyof Entitlements;
  /** Tour-scoped products append `/{tourId}` when a tour is selected and
   *  dim when none is. Home is artist-scoped (homeHref), not tour-scoped. */
  tourScoped: boolean;
}

export const PRODUCTS: ReadonlyArray<ProductDef> = [
  { key: 'home', label: 'Home', href: '/', Icon: House, flag: 'home', tourScoped: false },
  { key: 'operations', label: 'Operations', href: '/operations', Icon: Briefcase, flag: 'operations', tourScoped: true },
  { key: 'budget', label: 'Budget', href: '/budget', Icon: DollarSign, flag: 'budget', tourScoped: true },
  { key: 'advance', label: 'Advance', href: '/advance', Icon: ClipboardList, flag: 'advance', tourScoped: true },
];

export interface SubItem {
  label: string;
  href: string;
}

/** Resolve a product's top-bar href given the live tour / artist context,
 *  mirroring the legacy ProductRail logic (tour-scope append, Home →
 *  artist home, dim when a tour is required but missing). */
export function resolveProductHref(
  p: ProductDef,
  ctx: { selectedTourId: string | null; homeHref?: string },
): { href: string; tourRequired: boolean } {
  const tourRequired = p.tourScoped && !ctx.selectedTourId;
  let href = p.href;
  if (p.key === 'home' && ctx.homeHref) {
    href = ctx.homeHref;
  } else if (tourRequired) {
    href = ctx.homeHref ?? '/artists';
  } else if (p.tourScoped && ctx.selectedTourId) {
    href = `${p.href}/${ctx.selectedTourId}`;
  }
  return { href, tourRequired };
}

/** The Bar-2 items for a product — also the hover-dropdown contents on
 *  Bar 1 (one-load jumps). Returns [] when the product has no meaningful
 *  sub-pages in the current context (e.g. a tour-scoped product with no
 *  tour selected), so the dropdown simply doesn't open. */
export function getProductSubItems(
  key: Exclude<ProductRailActive, null>,
  ctx: { selectedTourId: string | null; homeHref?: string },
): SubItem[] {
  const t = ctx.selectedTourId;
  switch (key) {
    case 'home': {
      // homeHref is `/artists/[id]` when an artist is selected.
      const base = ctx.homeHref && ctx.homeHref.startsWith('/artists/') ? ctx.homeHref : null;
      if (!base) return [];
      return [
        { label: 'Home', href: base },
        { label: 'Financials', href: `${base}/financials` },
        { label: 'Channel lists', href: `${base}/channel-lists` },
        { label: 'Files', href: `${base}/files` },
        { label: 'Riders', href: `${base}/riders` },
      ];
    }
    case 'operations':
      if (!t) return [];
      return [
        { label: 'Summary', href: `/operations/${t}` },
        { label: 'Tour Personnel', href: `/operations/${t}/personnel` },
        { label: 'Routing', href: `/operations/${t}/routing` },
        { label: 'Channel list', href: `/operations/${t}/channel-list` },
        { label: 'Stage Plot', href: `/operations/${t}/stage-plot` },
        { label: 'Payroll', href: `/operations/${t}/payroll` },
        { label: 'Rooming', href: `/operations/${t}/rooming` },
        { label: 'Files', href: `/operations/${t}/files` },
        { label: 'Riders', href: `/operations/${t}/riders` },
      ];
    case 'budget':
      if (!t) return [];
      return [
        { label: 'Summary', href: `/budget/${t}?tab=summary` },
        { label: 'Expenses', href: `/budget/${t}?tab=budget` },
        { label: 'Income', href: `/budget/${t}?tab=income` },
        { label: 'Reports', href: `/budget/${t}?tab=reports` },
        { label: 'Settings', href: `/budget/${t}?tab=settings` },
      ];
    case 'advance':
      if (!t) return [];
      return [{ label: 'Overview', href: `/advance/${t}` }];
    default:
      return [];
  }
}
