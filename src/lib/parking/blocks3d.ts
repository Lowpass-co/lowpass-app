/* ============================================
   LOWPASS — Parking maps: vehicles as true-size 3D blocks (Nov 2026, Adam)

   "I really want the 3d maps to be to scale as well, with to scale vics."

   The 3D page draws the SAME vehicle parts as the overhead plan
   (silhouettes.ts), each lifted into a box: real length, width and height,
   placed at the vehicle's true ground position and heading. A 4 m-high bus is
   4 m tall against the real building beside it.

   Output is in the ground frame (metres east / north of the anchor) plus
   heights above the ground; the renderer converts to Earth coordinates.
   ============================================ */

import type { Pt } from './geo';
import type { VehicleItem } from './model';
import { vehicleParts, type PartKind } from './silhouettes';

export interface Block {
  kind: PartKind;
  /** Centre, ground frame (metres east / north of the anchor). */
  at: Pt;
  /** Compass heading of the block's length axis (= the vehicle's). */
  heading: number;
  /** Along the vehicle, across it, metres. */
  length: number;
  width: number;
  /** Bottom and top above the ground, metres. */
  z0: number;
  z1: number;
}

/** Ground clearance under a body, metres. */
const CLEARANCE = 0.3;

export function vehicleBlocks(v: Pick<VehicleItem, 'type' | 'x' | 'y' | 'heading' | 'length' | 'width' | 'height'>): Block[] {
  const h = (v.heading * Math.PI) / 180;
  const fwd = { x: Math.sin(h), y: Math.cos(h) };
  const right = { x: fwd.y, y: -fwd.x };
  const nose = { x: v.x + fwd.x * (v.length / 2), y: v.y + fwd.y * (v.length / 2) };
  const H = v.height;
  const out: Block[] = [];
  for (const p of vehicleParts(v.type, v.length, v.width)) {
    let f0 = p.f0;
    let f1 = p.f1;
    let z0: number;
    let z1: number;
    switch (p.kind) {
      case 'body':
      case 'cab':
      case 'hood':
        z0 = CLEARANCE;
        z1 = Math.max(CLEARANCE + 0.2, p.h * H);
        break;
      case 'roof':
        z0 = H;
        z1 = Math.max(H + 0.15, p.h * H);
        break;
      case 'glass':
        // A thin dark panel standing just proud of the front face it sits in.
        f0 = p.f0 - 0.16;
        f1 = f0 + 0.08;
        z0 = 0.5 * H;
        z1 = 0.92 * p.h * H;
        break;
      case 'mirror':
        z0 = 0.55 * H;
        z1 = 0.75 * H;
        break;
      case 'coupling':
        z1 = Math.max(0.6, p.h * H);
        z0 = z1 - 0.25;
        break;
      case 'rib':
        continue; // paint detail; too thin to model
    }
    const mid = (f0 + f1) / 2;
    const s = p.s ?? 0;
    out.push({
      kind: p.kind,
      at: { x: nose.x - fwd.x * mid + right.x * s, y: nose.y - fwd.y * mid + right.y * s },
      heading: v.heading,
      length: Math.max(0.02, f1 - f0),
      width: p.w,
      z0,
      z1,
    });
  }
  return out;
}

/** Where to look from, by default: behind-left of the drawing, tilted like
 *  Apple Maps 3D, facing the way the overhead plan points up. */
export function defaultCamera3d(centre: Pt, extent: number, rotation: number): { target: Pt; heading: number; pitch: number; range: number } {
  return { target: centre, heading: rotation, pitch: -35, range: Math.max(50, extent) };
}
