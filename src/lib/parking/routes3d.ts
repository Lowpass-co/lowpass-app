/* ============================================
   LOWPASS — a route's path in 3D (Nov 2026, Adam: "arrows follow the 3d,
   not the ground level")

   A route used to be drawn one of two ways: at an inside drawing's floor
   height only if it lay WHOLLY inside one, else draped on Google's mesh. A
   route from a bus outside to a dressing-room door inside (the usual case)
   was therefore draped — and inside the cut-away there is no mesh floor to
   drape on, so the line climbed the walls and the roof edge instead.

   Now the route is split where it crosses into or out of a zone (an inside
   drawing's floor, a "Flat in 3D" photo patch): each run inside a zone lies
   at that zone's height; only runs on the open street are draped. Pure: the
   caller says which zone a point is in.
   ============================================ */

import { dist, type Pt } from './geo';

export interface RouteRun {
  /** The zone this run lies in; null = the open street (drape it on the mesh). */
  zone: string | null;
  points: Pt[];
}

/**
 * Split a polyline into runs by zone. The route is sampled every `step`
 * metres (so a crossing is found to within a step), and every run keeps the
 * route's own corners. Neighbouring runs share their boundary point, so the
 * drawn line has no gap.
 */
export function splitRoute(points: Pt[], zoneAt: (p: Pt) => string | null, step = 0.5): RouteRun[] {
  if (points.length < 2) return [];
  // Densify, remembering which samples are the route's own corners.
  const samples: Array<{ p: Pt; corner: boolean }> = [];
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s];
    const b = points[s + 1];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push({ p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, corner: k === 0 });
    }
  }
  samples.push({ p: points[points.length - 1], corner: true });

  const runs: Array<{ zone: string | null; pts: Array<{ p: Pt; corner: boolean }> }> = [];
  for (const s of samples) {
    const zone = zoneAt(s.p);
    const cur = runs[runs.length - 1];
    if (cur && cur.zone === zone) {
      cur.pts.push(s);
      continue;
    }
    // A crossing: close the last run on this point, start the next from it.
    if (cur) cur.pts.push({ p: s.p, corner: true });
    runs.push({ zone, pts: [{ p: s.p, corner: true }] });
  }

  return runs
    .map((r) => ({
      zone: r.zone,
      // Only the ends and the route's corners — the samples in between are
      // on a straight line and add nothing.
      points: r.pts.filter((s, i) => s.corner || i === 0 || i === r.pts.length - 1).map((s) => s.p),
    }))
    .filter((r) => r.points.length >= 2 && pathLength(r.points) > 1e-6);
}

function pathLength(pts: Pt[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]);
  return t;
}
