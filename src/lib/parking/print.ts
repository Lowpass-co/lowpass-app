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
