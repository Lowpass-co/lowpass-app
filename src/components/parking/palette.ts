/* Parking map colours. Live: CSS variables. Export: the same variables
   resolved to literal colours (an SVG drawn into a canvas can't read CSS). */

import { PAINTS, vehicleSpec, type AreaType, type PaintId, type VehicleSpec } from '@/lib/parking/catalogue';

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
  'sky',
  'paper',
  ...PAINTS.map((p) => `paint-${p.id}` as const),
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

/** A vehicle's colour: its chosen paint, else its type's colour. */
export function vehicleColour(p: Palette, v: { type: string; colour?: PaintId }): string {
  return v.colour ? p[`paint-${v.colour}`] : roleColour(p, vehicleSpec(v.type)?.role ?? 'bus');
}

export function areaColour(p: Palette, t: AreaType): string {
  return t === 'crew' ? p['area-crew'] : t === 'guest' ? p['area-guest'] : t === 'no_go' ? p['area-no-go'] : p['area-other'];
}
