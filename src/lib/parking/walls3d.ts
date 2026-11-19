/* Walls round an inside drawing's cut-away (Nov 2026, Adam: "the vertical
   walls of the interior need to be visibly shaded … to avoid the weird
   inside-the-world look").

   The roof is clipped to the inside area, so from above you look through a
   paper-thin roof edge straight down to the floor, with nothing between —
   the eye reads it as a hole in the world. These walls stand on the cut edge,
   from the floor up to the roof height sampled at that edge, so the cut-away
   reads as a building with its roof lifted off. Each wall is toned by which
   way it faces (light from the north-west, like a hill-shaded map), so the
   corners read as corners.

   Pure: metres east / north of the anchor in, wall segments out. scene3d
   samples the roof heights and draws them. */

import type { Pt } from './geo';

/** The outline's points with long edges split, so each wall top can follow
 *  a curved roof (≤ `step` m apart; at most `max` points in all). */
export function wallRing(outline: readonly Pt[], step = 8, max = 160): Pt[] {
  const n = outline.length;
  if (n < 3) return [];
  const per = outline.map((a, i) => {
    const b = outline[(i + 1) % n];
    return Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  });
  const total = per.reduce((s, k) => s + k, 0);
  const scale = total > max ? max / total : 1;
  const out: Pt[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % n];
    const k = Math.max(1, Math.floor(per[i] * scale));
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  });
  return out;
}

/** Twice the signed area: > 0 = anticlockwise (x east, y north). */
function signedArea2(ring: readonly Pt[]): number {
  let s = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    s += a.x * b.y - b.x * a.y;
  });
  return s;
}

/** How lit a wall is (0.55 … 1) by the way its face points — INTO the
 *  cut-away, the side you see. Light comes from the north-west. */
export function wallShade(a: Pt, b: Pt, anticlockwise: boolean): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  // Inward normal: left of the direction of travel on an anticlockwise ring.
  const nx = (anticlockwise ? -dy : dy) / l;
  const ny = (anticlockwise ? dx : -dx) / l;
  const toLight = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }; // north-west
  const lit = nx * toLight.x + ny * toLight.y; // −1 … 1
  return Math.round((0.775 + 0.225 * lit) * 1000) / 1000;
}

/** The roof heights along the ring with spikes taken out: each is the median
 *  of itself and its neighbours (`reach` either side, round the ring). Google's
 *  model has masts and cables over roofs — at the O2 one sample landed on a
 *  mast and the wall rose 60 m up it (Nov 2026). A thin thing over the edge is
 *  one to three samples (≤ 8 m apart); a real roof is many. Unsampled points
 *  (null) take their neighbours' median. */
export function smoothTops(tops: readonly (number | null)[], reach = 3): (number | null)[] {
  const n = tops.length;
  return tops.map((_, i) => {
    const near: number[] = [];
    for (let k = -reach; k <= reach; k++) {
      const v = tops[(((i + k) % n) + n) % n];
      if (v != null) near.push(v);
    }
    if (!near.length) return null;
    near.sort((x, y) => x - y);
    const m = near.length >> 1;
    return near.length % 2 ? near[m] : (near[m - 1] + near[m]) / 2;
  });
}

export interface WallSegment {
  a: Pt;
  b: Pt;
  /** Wall-top heights at a and b (never below `bottom`). */
  topA: number;
  topB: number;
  bottom: number;
  shade: number;
}

/** One wall per edge of the ring, from `bottom` (the floor) up to the roof
 *  height sampled at each end (`tops[i]`, null = not sampled). An edge whose
 *  roof is less than `minRise` m above the floor at both ends is open street,
 *  not a wall, and is left out. */
export function wallSegments(ring: readonly Pt[], tops: readonly (number | null)[], bottom: number, minRise = 2): WallSegment[] {
  const n = ring.length;
  if (n < 3 || tops.length !== n) return [];
  const ccw = signedArea2(ring) > 0;
  const out: WallSegment[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ta = tops[i];
    const tb = tops[j];
    if (ta == null || tb == null) continue;
    if (ta - bottom < minRise && tb - bottom < minRise) continue;
    out.push({ a: ring[i], b: ring[j], topA: Math.max(ta, bottom), topB: Math.max(tb, bottom), bottom, shade: wallShade(ring[i], ring[j], ccw) });
  }
  return out;
}

/** The rim: a thin line along the wall tops, where the cut roof meets the
 *  wall, so the cut reads as deliberate rather than a ragged edge of Google's
 *  model (Nov 2026, Adam). One run per unbroken stretch of wall — an edge over
 *  open street (no wall) breaks it. Each point is [east, north, height]. */
export function rimRuns(segments: readonly WallSegment[]): [number, number, number][][] {
  const runs: [number, number, number][][] = [];
  let run: [number, number, number][] = [];
  let last: WallSegment | null = null;
  for (const w of segments) {
    const joins = last && last.b.x === w.a.x && last.b.y === w.a.y;
    if (!joins) {
      if (run.length > 1) runs.push(run);
      run = [[w.a.x, w.a.y, w.topA]];
    }
    run.push([w.b.x, w.b.y, w.topB]);
    last = w;
  }
  if (run.length > 1) runs.push(run);
  // A ring walled all the way round: the last run ends where the first starts — join them.
  if (runs.length > 1) {
    const first = runs[0];
    const tail = runs[runs.length - 1];
    const end = tail[tail.length - 1];
    if (end[0] === first[0][0] && end[1] === first[0][1]) {
      runs[0] = [...tail, ...first.slice(1)];
      runs.pop();
    }
  }
  return runs;
}
