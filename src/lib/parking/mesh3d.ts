/* ============================================
   LOWPASS — Parking maps: a tiny mesh kit for the 3D vehicles (Nov 2026, Adam)

   "Upgrade all these models … recognisable at a glance."

   Pure geometry, no Cesium: the vehicle builders (models3d.ts) describe each
   vehicle with these pieces, the renderer (scene3d.ts) only uploads the
   triangles. Everything is in the VEHICLE FRAME, metres:
     f — back from the nose (0 = front bumper, length = tail)
     s — across, + = the vehicle's right
     z — up from the ground
   Triangles carry a material (`Mat`), not a colour: the palette decides the
   colour, and `bakeShade` the light — vehicles are drawn UNLIT with the
   shading baked in, like the cut-away walls, so they look the same at any
   time of day (a lit material went near-black on a winter afternoon).
   ============================================ */

export type Mat =
  | 'body' // the vehicle's colour
  | 'shade' // the vehicle's colour, darker (cab vs box, lower panels)
  | 'pale' // the vehicle's colour, lighter (roof pods, fairings)
  | 'glass'
  | 'tyre'
  | 'metal' // rims, chrome, tanks, stacks, the fifth wheel
  | 'trim' // bumpers, grilles, chassis, mud flaps, seams
  | 'lamp' // headlamps
  | 'tail' // rear lamps
  | 'amber'; // side markers, indicators

export type V3 = [number, number, number];

export interface Mesh {
  /** 9 numbers per triangle: three (f, s, z) corners, wound outward. */
  pos: number[];
  /** One material per triangle. */
  mat: Mat[];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

export function normalOf(a: V3, b: V3, c: V3): V3 {
  const n = cross(sub(b, a), sub(c, a));
  const l = len(n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

export class MeshBuilder {
  readonly pos: number[] = [];
  readonly mat: Mat[] = [];

  /** One triangle. `out` = roughly the way it should face; the winding is
   *  flipped to match, so a builder never has to think about winding. */
  tri(a: V3, b: V3, c: V3, m: Mat, out?: V3): void {
    const n = cross(sub(b, a), sub(c, a));
    if (len(n) < 1e-9) return; // degenerate (a collapsed corner, a clamped break)
    if (out && dot(n, out) < 0) [b, c] = [c, b];
    this.pos.push(...a, ...b, ...c);
    this.mat.push(m);
  }

  quad(a: V3, b: V3, c: V3, d: V3, m: Mat, out?: V3): void {
    this.tri(a, b, c, m, out);
    this.tri(a, c, d, m, out);
  }

  mesh(): Mesh {
    return { pos: this.pos, mat: this.mat };
  }

  /** Append another mesh moved `df` back along the vehicle (a trailer on a rig). */
  add(m: Mesh, df = 0): void {
    for (let i = 0; i < m.pos.length; i += 3) this.pos.push(m.pos[i] + df, m.pos[i + 1], m.pos[i + 2]);
    this.mat.push(...m.mat);
  }
}

/* ── Lofted hulls ─────────────────────────────────────────── */

/** A cross-section of a hull at `f`: a rectangle from z0 to z1, ±hw wide,
 *  with rounded top / bottom corners. */
export interface Station {
  f: number;
  z0: number;
  z1: number;
  hw: number;
  /** Top corner radius (roof edges), bottom corner radius. */
  rt?: number;
  rb?: number;
}

export interface Face {
  /** Centre of the face, vehicle frame. */
  f: number;
  s: number;
  z: number;
  /** Outward normal (f, s, z). */
  n: V3;
}

export interface LoftOptions {
  /** Segments per rounded corner. */
  segs?: number;
  /** Heights where the SIDES get an edge — window sills and tops, belt lines —
   *  so a painted window has a crisp edge (clamped into each section). */
  zBreaks?: number[];
  /** Extra sections, interpolated, at these f — window and door ends. */
  fBreaks?: number[];
  /** Material for each face (by where it is and which way it faces). */
  paint: (q: Face) => Mat;
  /** Close the ends (default both). */
  capFront?: boolean;
  capBack?: boolean;
}

function lerpStation(a: Station, b: Station, f: number): Station {
  const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
  const l = (x: number, y: number) => x + (y - x) * t;
  return { f, z0: l(a.z0, b.z0), z1: l(a.z1, b.z1), hw: l(a.hw, b.hw), rt: l(a.rt ?? 0, b.rt ?? 0), rb: l(a.rb ?? 0, b.rb ?? 0) };
}

/** The section's outline, a closed ring (same point count for every station). */
function ring(st: Station, segs: number, zBreaks: number[]): V3[] {
  const h = st.z1 - st.z0;
  const rt = Math.max(0, Math.min(st.rt ?? 0, st.hw, h / 2));
  const rb = Math.max(0, Math.min(st.rb ?? 0, st.hw, h - rt));
  const right: [number, number][] = [];
  right.push([0, st.z0]);
  right.push([st.hw - rb, st.z0]);
  for (let i = 1; i <= segs; i++) {
    const a = -Math.PI / 2 + (i / segs) * (Math.PI / 2);
    right.push([st.hw - rb + rb * Math.cos(a), st.z0 + rb + rb * Math.sin(a)]);
  }
  const lo = st.z0 + rb;
  const hi = st.z1 - rt;
  for (const zb of zBreaks) right.push([st.hw, Math.min(hi, Math.max(lo, zb))]);
  right.push([st.hw, hi]);
  for (let i = 1; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    right.push([st.hw - rt + rt * Math.cos(a), hi + rt * Math.sin(a)]);
  }
  right.push([0, st.z1]);
  // Left half: the mirror, walked back down (skip the two centre points).
  const left = right.slice(1, -1).reverse().map(([s, z]) => [-s, z] as [number, number]);
  return [...right, ...left].map(([s, z]) => [st.f, s, z] as V3);
}

/** A hull lofted through `stations` (sorted by f; two at the same f make a
 *  step — the back of a bonnet, the front of a box behind a cab). */
export function loft(b: MeshBuilder, stations: Station[], o: LoftOptions): void {
  const segs = o.segs ?? 4;
  const zBreaks = [...(o.zBreaks ?? [])].sort((x, y) => x - y);
  // Refine: an interpolated section at each requested f (inside the hull only).
  let st = [...stations].sort((x, y) => x.f - y.f);
  for (const f of o.fBreaks ?? []) {
    if (f <= st[0].f || f >= st[st.length - 1].f) continue;
    if (st.some((s) => Math.abs(s.f - f) < 1e-4)) continue;
    const i = st.findIndex((s) => s.f > f);
    st = [...st.slice(0, i), lerpStation(st[i - 1], st[i], f), ...st.slice(i)];
  }
  const rings = st.map((s) => ring(s, segs, zBreaks));
  const n = rings[0].length;
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    const zc = (st[i].z0 + st[i].z1 + st[i + 1].z0 + st[i + 1].z1) / 4;
    const step = Math.abs(st[i + 1].f - st[i].f) < 1e-6;
    for (let j = 0; j < n; j++) {
      const a = A[j];
      const bb = A[(j + 1) % n];
      const c = B[(j + 1) % n];
      const d = B[j];
      const cen: V3 = [(a[0] + bb[0] + c[0] + d[0]) / 4, (a[1] + bb[1] + c[1] + d[1]) / 4, (a[2] + bb[2] + c[2] + d[2]) / 4];
      let out: V3;
      if (step) {
        // A step faces the side where the hull is smaller.
        const ra = Math.hypot(a[1], a[2] - zc) + Math.hypot(bb[1], bb[2] - zc);
        const rd = Math.hypot(d[1], d[2] - zc) + Math.hypot(c[1], c[2] - zc);
        out = ra > rd ? [1, 0, 0] : [-1, 0, 0];
      } else {
        out = [0, cen[1], cen[2] - zc];
        if (Math.abs(out[1]) + Math.abs(out[2]) < 1e-6) out = [0, 0, 1];
      }
      const nn = normalOf(a, bb, c);
      const nrm: V3 = dot(nn, out) < 0 ? [-nn[0], -nn[1], -nn[2]] : nn;
      const m = o.paint({ f: cen[0], s: cen[1], z: cen[2], n: nrm });
      b.quad(a, bb, c, d, m, out);
    }
  }
  // Ends: horizontal strips between each ring point and its mirror (the ring
  // is symmetric and rises monotonically up each half), so a windscreen or a
  // rear window can be painted on an end face with crisp top and bottom edges.
  const half = (n + 2) / 2; // points from bottom centre to top centre, inclusive
  const cap = (R: V3[], dir: number) => {
    const mirror = (k: number) => (k === 0 ? R[0] : k === half - 1 ? R[half - 1] : R[n - k]);
    for (let k = 0; k + 1 < half; k++) {
      const a = R[k];
      const bb = R[k + 1];
      const c = mirror(k + 1);
      const d = mirror(k);
      const m = o.paint({ f: a[0], s: 0, z: (a[2] + bb[2]) / 2, n: [dir, 0, 0] });
      b.quad(a, bb, c, d, m, [dir, 0, 0]);
    }
  };
  if (o.capFront !== false) cap(rings[0], -1);
  if (o.capBack !== false) cap(rings[rings.length - 1], 1);
}

/* ── Simple solids ────────────────────────────────────────── */

/** An axis-aligned box. `m` may vary by face (outward normal). */
export function box(b: MeshBuilder, f0: number, f1: number, s0: number, s1: number, z0: number, z1: number, m: Mat | ((n: V3) => Mat)): void {
  const P = (f: number, s: number, z: number): V3 => [f, s, z];
  const faces: [V3, V3, V3, V3, V3][] = [
    [P(f0, s0, z0), P(f0, s1, z0), P(f0, s1, z1), P(f0, s0, z1), [-1, 0, 0]],
    [P(f1, s0, z0), P(f1, s1, z0), P(f1, s1, z1), P(f1, s0, z1), [1, 0, 0]],
    [P(f0, s0, z0), P(f1, s0, z0), P(f1, s0, z1), P(f0, s0, z1), [0, -1, 0]],
    [P(f0, s1, z0), P(f1, s1, z0), P(f1, s1, z1), P(f0, s1, z1), [0, 1, 0]],
    [P(f0, s0, z1), P(f1, s0, z1), P(f1, s1, z1), P(f0, s1, z1), [0, 0, 1]],
    [P(f0, s0, z0), P(f1, s0, z0), P(f1, s1, z0), P(f0, s1, z0), [0, 0, -1]],
  ];
  for (const [a, bb, c, d, n] of faces) b.quad(a, bb, c, d, typeof m === 'function' ? m(n) : m, n);
}

/** A square beam between two points (any direction): drawbars, mirror arms. */
export function beam(b: MeshBuilder, p: V3, q: V3, w: number, h: number, m: Mat): void {
  const d = sub(q, p);
  const L = len(d) || 1;
  const u: V3 = [d[0] / L, d[1] / L, d[2] / L];
  // Two directions across the beam.
  let a = cross(u, [0, 0, 1]);
  if (len(a) < 1e-6) a = cross(u, [0, 1, 0]);
  const al = len(a);
  a = [(a[0] / al) * (w / 2), (a[1] / al) * (w / 2), (a[2] / al) * (w / 2)];
  let c = cross(a, u);
  const cl = len(c) || 1;
  c = [(c[0] / cl) * (h / 2), (c[1] / cl) * (h / 2), (c[2] / cl) * (h / 2)];
  const corner = (o: V3, sa: number, sc: number): V3 => [o[0] + a[0] * sa + c[0] * sc, o[1] + a[1] * sa + c[1] * sc, o[2] + a[2] * sa + c[2] * sc];
  const ring = (o: V3) => [corner(o, -1, -1), corner(o, 1, -1), corner(o, 1, 1), corner(o, -1, 1)];
  const P = ring(p);
  const Q = ring(q);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const mid: V3 = [(P[i][0] + P[j][0]) / 2 - p[0], (P[i][1] + P[j][1]) / 2 - p[1], (P[i][2] + P[j][2]) / 2 - p[2]];
    b.quad(P[i], P[j], Q[j], Q[i], m, mid);
  }
  b.quad(P[0], P[1], P[2], P[3], m, [-u[0], -u[1], -u[2]]);
  b.quad(Q[0], Q[1], Q[2], Q[3], m, u);
}

/** A rounded box: a two-section loft (pods, tanks, bumpers, mirrors). */
export function roundBox(b: MeshBuilder, f0: number, f1: number, sc: number, hw: number, z0: number, z1: number, r: number, m: Mat): void {
  const mb = new MeshBuilder();
  loft(mb, [{ f: f0, z0, z1, hw, rt: r, rb: r }, { f: f1, z0, z1, hw, rt: r, rb: r }], { segs: 3, paint: () => m });
  for (let i = 0; i < mb.pos.length; i += 3) b.pos.push(mb.pos[i], mb.pos[i + 1] + sc, mb.pos[i + 2]);
  b.mat.push(...mb.mat);
}

/** A cylinder on an axis ACROSS the vehicle (a wheel), from s0 to s1. */
export function cylAcross(b: MeshBuilder, fc: number, zc: number, r: number, s0: number, s1: number, segs: number, side: Mat, cap0: Mat | null, cap1: Mat | null): void {
  const pt = (i: number, s: number): V3 => {
    const a = (i / segs) * Math.PI * 2;
    return [fc + r * Math.cos(a), s, zc + r * Math.sin(a)];
  };
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2 + Math.PI / segs;
    b.quad(pt(i, s0), pt(i + 1, s0), pt(i + 1, s1), pt(i, s1), side, [Math.cos(a), 0, Math.sin(a)]);
    if (cap0) b.tri([fc, s0, zc], pt(i, s0), pt(i + 1, s0), cap0, [0, s0 < s1 ? -1 : 1, 0]);
    if (cap1) b.tri([fc, s1, zc], pt(i, s1), pt(i + 1, s1), cap1, [0, s1 > s0 ? 1 : -1, 0]);
  }
}

/** A vertical cylinder (stacks, landing legs, beacons). */
export function cylUp(b: MeshBuilder, fc: number, sc: number, r: number, z0: number, z1: number, segs: number, m: Mat, top: Mat | null = m): void {
  const pt = (i: number, z: number): V3 => {
    const a = (i / segs) * Math.PI * 2;
    return [fc + r * Math.cos(a), sc + r * Math.sin(a), z];
  };
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2 + Math.PI / segs;
    b.quad(pt(i, z0), pt(i + 1, z0), pt(i + 1, z1), pt(i, z1), m, [Math.cos(a), Math.sin(a), 0]);
    if (top) b.tri([fc, sc, z1], pt(i, z1), pt(i + 1, z1), top, [0, 0, 1]);
  }
}

/** A cylinder along the vehicle (fuel tanks). */
export function cylAlong(b: MeshBuilder, f0: number, f1: number, sc: number, zc: number, r: number, segs: number, m: Mat): void {
  const pt = (i: number, f: number): V3 => {
    const a = (i / segs) * Math.PI * 2;
    return [f, sc + r * Math.cos(a), zc + r * Math.sin(a)];
  };
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2 + Math.PI / segs;
    b.quad(pt(i, f0), pt(i + 1, f0), pt(i + 1, f1), pt(i, f1), m, [0, Math.cos(a), Math.sin(a)]);
    b.tri([f0, sc, zc], pt(i, f0), pt(i + 1, f0), m, [-1, 0, 0]);
    b.tri([f1, sc, zc], pt(i, f1), pt(i + 1, f1), m, [1, 0, 0]);
  }
}

/* ── Decals: flat panels a hair proud of a flat surface ───── */

/** On a SIDE (s = ±at), facing out. */
export function sidePanel(b: MeshBuilder, at: number, f0: number, f1: number, z0: number, z1: number, m: Mat): void {
  const side = Math.sign(at) || 1;
  b.quad([f0, at, z0], [f1, at, z0], [f1, at, z1], [f0, at, z1], m, [0, side, 0]);
}

/** On a roof at z, facing up. */
export function topPanel(b: MeshBuilder, z: number, f0: number, f1: number, s0: number, s1: number, m: Mat): void {
  b.quad([f0, s0, z], [f1, s0, z], [f1, s1, z], [f0, s1, z], m, [0, 0, 1]);
}

/** On a face across the vehicle at f, facing front (dir -1) or back (+1). */
export function endPanel(b: MeshBuilder, f: number, dir: 1 | -1, s0: number, s1: number, z0: number, z1: number, m: Mat): void {
  b.quad([f, s0, z0], [f, s1, z0], [f, s1, z1], [f, s0, z1], m, [dir, 0, 0]);
}

/** A disc on a side (wheel arches, hub caps), centre (fc, zc). */
export function sideDisc(b: MeshBuilder, at: number, fc: number, zc: number, r: number, segs: number, m: Mat, from = 0, to = Math.PI * 2): void {
  const side = Math.sign(at) || 1;
  for (let i = 0; i < segs; i++) {
    const a0 = from + ((to - from) * i) / segs;
    const a1 = from + ((to - from) * (i + 1)) / segs;
    b.tri([fc, at, zc], [fc + r * Math.cos(a0), at, zc + r * Math.sin(a0)], [fc + r * Math.cos(a1), at, zc + r * Math.sin(a1)], m, [0, side, 0]);
  }
}

/* ── Wheels ───────────────────────────────────────────────── */

export interface WheelSpec {
  /** Axle position (back from the nose). */
  f: number;
  /** Tyre radius, metres. */
  r: number;
  /** Outer face of the tyre, |s|. */
  outer: number;
  /** Tread width (both tyres of a dual pair together). */
  width: number;
  dual?: boolean;
}

/** A pair of wheels (both sides): tyre, rim, hub. Outer faces sit a hair
 *  proud of the body side so the whole wheel reads from the side. */
export function wheels(b: MeshBuilder, w: WheelSpec): void {
  const segs = 24;
  for (const side of [-1, 1]) {
    const o = side * w.outer;
    const i = side * (w.outer - w.width);
    cylAcross(b, w.f, w.r, w.r, i, o, segs, 'tyre', 'tyre', 'tyre');
    if (w.dual) cylAcross(b, w.f, w.r, w.r * 0.97, i + side * w.width * 0.5, i + side * w.width * 0.53, segs, 'trim', null, null);
    // Rim and hub, on the outer face.
    sideDisc(b, o + side * 0.004, w.f, w.r, w.r * 0.62, segs, 'metal');
    sideDisc(b, o + side * 0.008, w.f, w.r, w.r * 0.22, 10, 'trim');
  }
}

/** A wheel well on the body side round a wheel (the part above `zFloor`,
 *  the body's bottom edge): dark, or a polished trailer fender. */
export function arch(b: MeshBuilder, hw: number, f: number, r: number, zFloor: number, m: Mat = 'trim'): void {
  for (const side of [-1, 1]) {
    const at = side * (hw + 0.002);
    // Only where there's body: above the body's bottom edge.
    const lo = Math.asin(Math.max(-1, Math.min(1, (zFloor - r) / (r * 1.14))));
    sideDisc(b, at, f, r, r * 1.14, 14, m, Math.max(0, lo), Math.PI - Math.max(0, lo));
  }
}

/* ── After building ───────────────────────────────────────── */

/** Bounds of a mesh: [min f, max f, min s, max s, min z, max z]. */
export function bounds(m: Mesh): [number, number, number, number, number, number] {
  const r: [number, number, number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) {
    r[0] = Math.min(r[0], m.pos[i]);
    r[1] = Math.max(r[1], m.pos[i]);
    r[2] = Math.min(r[2], m.pos[i + 1]);
    r[3] = Math.max(r[3], m.pos[i + 1]);
    r[4] = Math.min(r[4], m.pos[i + 2]);
    r[5] = Math.max(r[5], m.pos[i + 2]);
  }
  return r;
}

/** Light from the sky, high and a little behind-left of the viewer's usual
 *  seat, in the WORLD frame (east, north, up). */
const LIGHT: V3 = (() => {
  const v: V3 = [-0.35, -0.55, 0.76];
  const l = len(v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** Brightness 0..1 for a face whose outward normal is `n` (vehicle frame)
 *  on a vehicle heading `heading` (compass degrees). Unlit-and-baked: a
 *  floor of 0.58 so the shadow side never goes black on a photo. */
export function bakeShade(n: V3, heading: number): number {
  const h = (heading * Math.PI) / 180;
  const fwd = { x: Math.sin(h), y: Math.cos(h) };
  const right = { x: fwd.y, y: -fwd.x };
  // Vehicle frame → world: f runs BACK (−fwd), s runs right.
  const e = -fwd.x * n[0] + right.x * n[1];
  const nn = -fwd.y * n[0] + right.y * n[1];
  const d = e * LIGHT[0] + nn * LIGHT[1] + n[2] * LIGHT[2];
  return 0.58 + 0.42 * Math.max(0, d);
}

/** RGB 0..255 of a #RRGGBB / #RGB colour (palette values are resolved hex). */
export function hexRgb(hex: string): V3 {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [136, 136, 136];
}

/** Per-vertex RGBA (4 bytes a corner, 12 a triangle), lit by `bakeShade`. */
export function bakeColours(m: Mesh, heading: number, colourOf: (mat: Mat) => V3): Uint8Array {
  const out = new Uint8Array((m.pos.length / 3) * 4);
  for (let t = 0; t < m.mat.length; t++) {
    const i = t * 9;
    const a: V3 = [m.pos[i], m.pos[i + 1], m.pos[i + 2]];
    const bb: V3 = [m.pos[i + 3], m.pos[i + 4], m.pos[i + 5]];
    const c: V3 = [m.pos[i + 6], m.pos[i + 7], m.pos[i + 8]];
    const k = bakeShade(normalOf(a, bb, c), heading);
    const rgb = colourOf(m.mat[t]);
    for (let v = 0; v < 3; v++) {
      const o = (t * 3 + v) * 4;
      out[o] = Math.min(255, Math.round(rgb[0] * k));
      out[o + 1] = Math.min(255, Math.round(rgb[1] * k));
      out[o + 2] = Math.min(255, Math.round(rgb[2] * k));
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Lighter / darker versions of a colour (body → shade / pale). */
export function tint(rgb: V3, k: number): V3 {
  return k >= 0
    ? [rgb[0] + (255 - rgb[0]) * k, rgb[1] + (255 - rgb[1]) * k, rgb[2] + (255 - rgb[2]) * k]
    : [rgb[0] * (1 + k), rgb[1] * (1 + k), rgb[2] * (1 + k)];
}
