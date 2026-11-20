/* ============================================
   LOWPASS — Parking maps: 3D helpers (Nov 2026, Adam)

   Where a vehicle stands on Google's mesh and where the camera starts. The
   vehicles themselves are models3d.ts (they replaced the box blocks that
   used to live here — "recognisable at a glance").
   ============================================ */

import type { Pt } from './geo';

/** Where to look from, by default: behind-left of the drawing, tilted like
 *  Apple Maps 3D, facing the way the overhead plan points up. */
export function defaultCamera3d(centre: Pt, extent: number, rotation: number): { target: Pt; heading: number; pitch: number; range: number } {
  return { target: centre, heading: rotation, pitch: -35, range: Math.max(50, extent) };
}

/** How far a vehicle's own ground may sit above the ground around it before
 *  it's taken to be a roof or canopy, metres. A kerb, a ramp: under this. */
export const ROOF_JUMP_M = 2.5;

/** Where a vehicle stands, from Google's mesh (Nov 2026, Adam: vehicles
 *  "wedged in the roof"). The mesh's height is its TOP surface, so under a
 *  canopy (the O2's roof edge) every point under the vehicle says "roof".
 *  `own` = heights under the vehicle (centre + corners), `ring` = heights in a
 *  ring round it. Normally the lowest of `own` (so a tree doesn't lift a bus);
 *  if that is more than ROOF_JUMP_M above the lowest of the ring, the vehicle
 *  is under something — stand it on the ground round it instead. */
export function standingHeight(own: number[], ring: number[], fallback: number): number {
  const o = own.filter(Number.isFinite);
  const r = ring.filter(Number.isFinite);
  if (!o.length) return r.length ? Math.min(...r) : fallback;
  const lowOwn = Math.min(...o);
  if (!r.length) return lowOwn;
  const lowRing = Math.min(...r);
  return lowOwn - lowRing > ROOF_JUMP_M ? lowRing : lowOwn;
}

/** Points in a ring round a vehicle, `radius` metres out (8 directions). */
export function ringAround(c: { x: number; y: number }, radius: number): { x: number; y: number }[] {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return { x: c.x + radius * Math.cos(a), y: c.y + radius * Math.sin(a) };
  });
}
