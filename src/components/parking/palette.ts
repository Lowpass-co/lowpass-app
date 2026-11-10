/* Parking map colours. Live: CSS variables. Export: the same variables
   resolved to literal colours (an SVG drawn into a canvas can't read CSS). */

import type { VehicleSpec, AreaType } from '@/lib/parking/catalogue';

export const PALETTE_KEYS = [
  'bus',
  'truck',
  'van',
  'car',
  'power',
  'route',
  'area-crew',
  'area-guest',
  'area-no-go',
  'area-other',
  'measure',
  'ink',
  'halo',
  'chip',
  'select',
  'blank',
  'grid',
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;

export const LIVE_PALETTE = Object.fromEntries(PALETTE_KEYS.map((k) => [k, `var(--lp-map-${k})`])) as Palette;

/** The live tokens as literal colours, read from the document. */
export function resolvePalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(PALETTE_KEYS.map((k) => [k, cs.getPropertyValue(`--lp-map-${k}`).trim() || '#888888'])) as Palette;
}

export const roleColour = (p: Palette, role: VehicleSpec['role']): string => p[role];

export function areaColour(p: Palette, t: AreaType): string {
  return t === 'crew' ? p['area-crew'] : t === 'guest' ? p['area-guest'] : t === 'no_go' ? p['area-no-go'] : p['area-other'];
}
