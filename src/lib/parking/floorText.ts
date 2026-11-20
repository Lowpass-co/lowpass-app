/* ============================================
   LOWPASS — Parking maps: an area's name PAINTED ON THE GROUND in 3D
   (Nov 2026, Adam: "area labels are floating, not on the floor")

   Like a road marking: the name lies flat inside the area, along its long
   side, as big as fits, reading left to right (west → east; a north–south
   area reads south → north). Pure — scene3d draws it as a flat decal.
   Ground frame, metres east / north of the anchor.
   ============================================ */

import type { Pt } from './geo';

export interface FloorText {
  /** Centre of the text, ground frame. */
  at: Pt;
  /** The baseline's direction (unit vector, east / north). */
  u: Pt;
  /** Letter height and the text's length, metres. */
  height: number;
  length: number;
}

/** Glyph width as a share of the letter height (bold sans). */
export const GLYPH = 0.62;
/** Never smaller than a dinner plate, never bigger than a lane marking. */
const MIN_H = 0.5;
const MAX_H = 3;

export function floorText(points: readonly Pt[], text: string): FloorText | null {
  const chars = text.trim().length;
  if (points.length < 3 || !chars) return null;
  const at = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
  // The longest side sets the direction.
  let u = { x: 1, y: 0 };
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best) {
      best = l;
      u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    }
  }
  // Read left to right: the baseline runs east (or north when it's straight up).
  if (u.x < -1e-6 || (Math.abs(u.x) <= 1e-6 && u.y < 0)) u = { x: -u.x, y: -u.y };
  const perp = { x: -u.y, y: u.x };
  const along = points.map((p) => (p.x - at.x) * u.x + (p.y - at.y) * u.y);
  const across = points.map((p) => (p.x - at.x) * perp.x + (p.y - at.y) * perp.y);
  const len = Math.max(...along) - Math.min(...along);
  const wid = Math.max(...across) - Math.min(...across);
  const height = Math.max(MIN_H, Math.min(MAX_H, wid * 0.55, (len * 0.85) / (chars * GLYPH)));
  return { at, u, height, length: chars * GLYPH * height };
}

/** The decal's ground rectangle (north-up), metres: [x0, y0, x1, y1]. */
export function floorTextBounds(t: FloorText, pad = 0.3): [number, number, number, number] {
  const perp = { x: -t.u.y, y: t.u.x };
  const hl = t.length / 2 + pad;
  const hh = t.height / 2 + pad;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => ({ x: t.at.x + t.u.x * hl * i + perp.x * hh * j, y: t.at.y + t.u.y * hl * i + perp.y * hh * j }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
