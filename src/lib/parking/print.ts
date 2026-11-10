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
