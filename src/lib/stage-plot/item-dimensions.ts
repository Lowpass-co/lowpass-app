/* ============================================================
   LOWPASS — Stage Plot item dimensions (§SP-FIX-2)

   Items are hard-locked to their real-world top-down footprint. The
   footprint (W × D, feet) is the single source of truth and lives on
   each IconDescriptor (icons/*.ts) — a 22" kick is 1.8 × 1.4, a 14"
   snare 1.2 × 1.2, a Marshall cab 2.5 × 1.2, a mic round-base 1 × 1,
   etc. This module adds the third dimension (height, for risers /
   stacked gear and the expert W×D×H override) and the helper the UI
   uses to resolve an item's effective dimensions.

   Per-item scaling is removed (no scale slider); canvas zoom is the
   only zoom. An expert override (workspace-gated) can set explicit
   W × D × H — see EXPERT_DIMENSIONS_KEY below.
   ============================================================ */

import { getIcon } from './icons';
import type { IconCategoryKey } from './icons/types';

/** Typical real-world heights (ft) by category — the third dimension
 *  footprints don't carry. Risers/stacks override H explicitly. */
const DEFAULT_HEIGHT_FT: Partial<Record<IconCategoryKey, number>> = {
  drums: 2,
  amps: 2.5,
  monitors: 1.5,
  keys: 3,
  strings: 0.3,
  mics: 4,
  stands: 4,
  signal: 1,
  infrastructure: 1,
  lighting: 1.5,
  musicians: 5.5,
  utility: 0.5,
};

export function defaultHeightFt(category: IconCategoryKey): number {
  return DEFAULT_HEIGHT_FT[category] ?? 1;
}

export interface ItemDimensions {
  width_ft: number;
  depth_ft: number;
  height_ft: number;
}

/** Resolve an icon's real-world default dimensions (footprint W×D +
 *  category default H). null for unknown icons. */
export function itemDimensions(iconName: string): ItemDimensions | null {
  const icon = getIcon(iconName);
  if (!icon) return null;
  return {
    width_ft: icon.footprint.width_ft,
    depth_ft: icon.footprint.depth_ft,
    height_ft: defaultHeightFt(icon.category),
  };
}

/* Expert "custom dimensions" override gate. Canonical home is a
   workspace setting (Stripe/entitlements seam — see lib/entitlements);
   until that lands the editor reads this localStorage flag so the
   W×D×H fields stay hidden from everyday users. */
export const EXPERT_DIMENSIONS_KEY = 'lp:stage-plot:expert-dimensions';

export function readExpertDimensions(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(EXPERT_DIMENSIONS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeExpertDimensions(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXPERT_DIMENSIONS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
