/* ============================================
   LOWPASS — Parking maps: what goes on the paper (Nov 2026, Adam)

   The PDF frames the DRAWING, not the editor window: a wide screen used to
   print at 1:1,500 with the bus 14 mm long. printFrame() fits every item
   (plus a margin, plus a minimum width of context) in the map frame at the
   most detailed standard scale, with the frame's axes on the screen's axes
   (so the map prints at the rotation you squared it to). The editor draws
   the same frame, so what you see outlined is what prints.
   ============================================ */

import { PRINT_SCALES, printScaleFor, type Pt, type View } from './geo';
import { vehicleCorners, type ParkingItem } from './model';

/** The map frame on A4 landscape, millimetres (exportPdf lays it out). */
export const PRINT_FRAME_MM = { w: 196, h: 174 } as const;
/** Ground margin around the drawing, metres. */
export const PRINT_MARGIN_M = 8;
/** Narrowest stretch of ground a page shows — enough road for a driver to read. */
export const PRINT_MIN_WIDTH_M = 70;

export type PrintScaleChoice = 'auto' | (typeof PRINT_SCALES)[number];

/** Every point the drawing occupies, ground frame. */
export function itemPoints(items: ParkingItem[]): Pt[] {
  const out: Pt[] = [];
  for (const i of items) {
    if (i.kind === 'vehicle') out.push(...vehicleCorners(i), { x: i.x, y: i.y });
    else if (i.kind === 'marker') out.push({ x: i.x, y: i.y });
    else if (i.kind === 'measure') out.push(i.a, i.b);
    else out.push(...i.points);
  }
  return out;
}

export interface PrintFrame {
  /** Centre of the printed area, ground frame. */
  cx: number;
  cy: number;
  /** 1:N */
  scale: number;
  /** Ground size of the printed area, metres (screen-aligned). */
  wM: number;
  hM: number;
}

export function printFrame(items: ParkingItem[], view: View, viewport: { w: number; h: number }, choice: PrintScaleChoice = 'auto'): PrintFrame {
  const r = (view.rotation * Math.PI) / 180;
  // Frame the PARKING: a long approach route would zoom the close-up out to
  // nothing (seen in testing: 1:2,000 with the buses a few mm long) — that
  // is what an overview page is for. Routes count only when they're all there is.
  const parked = items.filter((i) => i.kind !== 'route');
  const pts = itemPoints(parked.length ? parked : items);
  let cx = view.cx;
  let cy = view.cy;
  let needW = viewport.w / view.ppm;
  let needH = viewport.h / view.ppm;
  if (pts.length) {
    // Into screen-aligned axes: u = across the screen, v = up it.
    const u = pts.map((p) => p.x * Math.cos(r) - p.y * Math.sin(r));
    const v = pts.map((p) => p.x * Math.sin(r) + p.y * Math.cos(r));
    const u0 = Math.min(...u);
    const u1 = Math.max(...u);
    const v0 = Math.min(...v);
    const v1 = Math.max(...v);
    const uc = (u0 + u1) / 2;
    const vc = (v0 + v1) / 2;
    cx = uc * Math.cos(r) + vc * Math.sin(r);
    cy = -uc * Math.sin(r) + vc * Math.cos(r);
    needW = Math.max(PRINT_MIN_WIDTH_M, u1 - u0 + 2 * PRINT_MARGIN_M);
    needH = v1 - v0 + 2 * PRINT_MARGIN_M;
  }
  const scale =
    choice === 'auto' ? Math.max(printScaleFor(needW, PRINT_FRAME_MM.w), printScaleFor(needH, PRINT_FRAME_MM.h)) : choice;
  return { cx, cy, scale, wM: (PRINT_FRAME_MM.w * scale) / 1000, hM: (PRINT_FRAME_MM.h * scale) / 1000 };
}

/** Where a new item lands: the view centre, stepped aside from anything already there. */
export function freeSpot(items: ParkingItem[], at: Pt, view: View, step = 4): Pt {
  const r = (view.rotation * Math.PI) / 180;
  const across = { x: Math.cos(r), y: -Math.sin(r) }; // screen-right in ground terms
  const taken = itemPoints(items);
  for (let n = 0; n < 40; n++) {
    const p = { x: at.x + across.x * step * n, y: at.y + across.y * step * n };
    if (!taken.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < step * 0.75)) return p;
  }
  return at;
}

/** The PDF's vehicle numbers (Nov 2026, Adam: names on a crowded row "really
 *  tight" on the export). Each vehicle carries a small numbered badge and the
 *  key lists 1 · Bus A · Tour bus · 13.5 m. ONE numbering for the whole PDF —
 *  every page (and every level) uses the same number for the same vehicle.
 *  Neighbours get consecutive numbers: a nearest-neighbour walk from the
 *  north-west-most vehicle, so a row of trucks reads 7, 8, 9 … along the row. */
export function vehicleNumbers(items: readonly ParkingItem[]): Map<string, number> {
  const left = items.filter((i) => i.kind === 'vehicle').map((v) => ({ id: v.id, x: (v as { x: number }).x, y: (v as { y: number }).y }));
  left.sort((a, b) => a.x - a.y - (b.x - b.y) || (a.id < b.id ? -1 : 1));
  const out = new Map<string, number>();
  let at = left.shift();
  while (at) {
    out.set(at.id, out.size + 1);
    let best = -1;
    let bestD = Infinity;
    left.forEach((v, i) => {
      const d = (v.x - at!.x) ** 2 + (v.y - at!.y) ** 2;
      if (d < bestD || (d === bestD && v.id < left[best].id)) {
        best = i;
        bestD = d;
      }
    });
    at = best >= 0 ? left.splice(best, 1)[0] : undefined;
  }
  return out;
}

/** Badge radii that don't overlap: each is at most just under half the gap to
 *  the nearest other badge, never below `min` (readable on paper beats
 *  touching — at that density they may just touch). Screen pixels. */
export function badgeRadii(centres: readonly Pt[], r: number, min: number): number[] {
  return centres.map((c, i) => {
    let near = Infinity;
    centres.forEach((o, j) => {
      if (j !== i) near = Math.min(near, Math.hypot(o.x - c.x, o.y - c.y));
    });
    return Math.max(min, Math.min(r, near * 0.48));
  });
}

/** Do two convex polygons overlap? (Separating-axis test; touching = no.) */
export function convexOverlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const r of a) {
        const d = r.x * nx + r.y * ny;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const r of b) {
        const d = r.x * nx + r.y * ny;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  }
  return true;
}

export interface NameSpot {
  id: string;
  /** The vehicle's centre on screen. */
  centre: Pt;
  /** The vehicle's axis on screen, degrees, already turned upright (−90…90). */
  angle: number;
  /** Half the vehicle's width / length on screen. */
  halfWidth: number;
  halfLength: number;
  /** The name tag's size on screen. */
  w: number;
  h: number;
}

/** A rotated rectangle's corners. */
export function rectAt(c: Pt, angle: number, w: number, h: number): Pt[] {
  const a = (angle * Math.PI) / 180;
  const ux = { x: Math.cos(a), y: Math.sin(a) };
  const uy = { x: -Math.sin(a), y: Math.cos(a) };
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => ({ x: c.x + ux.x * (w / 2) * i + uy.x * (h / 2) * j, y: c.y + ux.y * (w / 2) * i + uy.y * (h / 2) * j }));
}

/** Where a vehicle's name tag goes. `leader`: a callout — draw a thin line
 *  from the vehicle's centre to the tag. */
export interface NamePlace {
  at: Pt;
  angle: number;
  how: 'end' | 'side' | 'callout';
  leader?: Pt;
}

/** NAMES FIRST (Nov 2026, Adam: the venue's own plan "manages to get labels
 *  on the export … prioritise that over the numbers"). Every vehicle that
 *  isn't named inside itself gets a tag, tried in this order, and only where
 *  it crosses no vehicle, badge or tag and stays on the picture:
 *    1. END    just past the vehicle's end, along its axis — a row of buses
 *              or trucks side by side is named at their ends, unambiguous;
 *    2. SIDE   just off its side — only on the OPEN side (the strip beyond
 *              must be clear), never sandwiched between two vehicles;
 *    3. CALLOUT the nearest clear spot round it (rings of 12 directions,
 *              upright), with a leader line back to the vehicle.
 *  A vehicle with no spot at all keeps just its number (the key names it).
 *  Taken in `spots` order (the numbers). Screen pixels. */
export function layoutNames(
  spots: readonly NameSpot[],
  obstacles: readonly (readonly Pt[])[],
  bounds: { w: number; h: number },
  gap = 2,
  rings = 8,
): Map<string, NamePlace> {
  const placed: Pt[][] = [];
  const out = new Map<string, NamePlace>();
  const inside = (r: Pt[]) => r.every((q) => q.x >= 0 && q.y >= 0 && q.x <= bounds.w && q.y <= bounds.h);
  const free = (r: Pt[]) => inside(r) && !obstacles.some((o) => convexOverlap(r, o)) && !placed.some((o) => convexOverlap(r, o));
  const take = (id: string, r: Pt[], p: NamePlace) => {
    placed.push(r);
    out.set(id, p);
  };
  for (const s of spots) {
    const a = (s.angle * Math.PI) / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const perp = { x: -u.y, y: u.x };
    let done = false;
    // 1. Past either end, along the axis (the strip beyond clear too).
    for (const side of [1, -1]) {
      const d = s.halfLength + gap + s.w / 2;
      const c = { x: s.centre.x + u.x * d * side, y: s.centre.y + u.y * d * side };
      const r = rectAt(c, s.angle, s.w, s.h);
      const beyond = rectAt({ x: c.x + u.x * (s.w / 2 + s.h) * side, y: c.y + u.y * (s.w / 2 + s.h) * side }, s.angle, s.h, s.h);
      if (free(r) && !obstacles.some((o) => convexOverlap(beyond, o))) {
        take(s.id, r, { at: c, angle: s.angle, how: 'end' });
        done = true;
        break;
      }
    }
    if (done) continue;
    // 2. Beside it, on the open side.
    for (const side of [1, -1]) {
      const off = s.halfWidth + gap + s.h / 2;
      const c = { x: s.centre.x + perp.x * off * side, y: s.centre.y + perp.y * off * side };
      const r = rectAt(c, s.angle, s.w, s.h);
      const beyond = rectAt({ x: c.x + perp.x * s.h * side, y: c.y + perp.y * s.h * side }, s.angle, s.w, s.h);
      if (free(r) && !obstacles.some((o) => convexOverlap(beyond, o)) && !placed.some((o) => convexOverlap(beyond, o))) {
        take(s.id, r, { at: c, angle: s.angle, how: 'side' });
        done = true;
        break;
      }
    }
    if (done) continue;
    // 3. A callout: the nearest clear spot, upright, with a leader line.
    const r0 = Math.max(s.halfLength, s.halfWidth) + gap;
    for (let k = 1; k <= rings && !done; k++) {
      const R = r0 + k * s.h * 1.3;
      for (let t = 0; t < 12 && !done; t++) {
        const th = (t * Math.PI) / 6 - Math.PI / 2;
        const c = { x: s.centre.x + Math.cos(th) * (R + s.w / 2 * Math.abs(Math.cos(th))), y: s.centre.y + Math.sin(th) * (R + (s.h / 2) * Math.abs(Math.sin(th))) };
        const r = rectAt(c, 0, s.w, s.h);
        if (free(r)) {
          take(s.id, r, { at: c, angle: 0, how: 'callout', leader: s.centre });
          done = true;
        }
      }
    }
  }
  return out;
}

/** A name written INSIDE the vehicle, beside its badge, once the vehicle is
 *  big enough on screen (Nov 2026, Adam: on the driver link "they should still
 *  show labels on zoom, not just numbers"). Along the axis, in the half on one
 *  side of the badge; null while it wouldn't be readable (< `min` px tall).
 *  `offset`: from the vehicle's centre along its (upright) axis, negative =
 *  before the badge — "Bus A ①". */
export function insideName(lengthPx: number, widthPx: number, badgeR: number, chars: number, max: number, min: number, pad = 2): { offset: number; size: number } | null {
  const room = lengthPx / 2 - badgeR - pad * 2;
  if (room <= 0 || chars <= 0) return null;
  const size = Math.min(max, widthPx * 0.72, room / (chars * 0.6));
  if (size < min) return null;
  return { offset: -(badgeR + pad + (chars * 0.6 * size) / 2), size };
}
