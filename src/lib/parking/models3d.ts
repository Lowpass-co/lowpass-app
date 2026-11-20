/* ============================================
   LOWPASS — Parking maps: recognisable 3D vehicles (Nov 2026, Adam)

   "Complete option 1 as detailed as possible … these vehicles should be
   recognisable at a glance."

   Each vehicle is built from the published shape of the real thing it stands
   for, scaled to the vehicle's TRUE length × width × height (the plan's
   numbers — a resized vehicle stays true size):

     EU tour bus   Neoplan Skyliner double-deck: 14.0 × 2.55 × 4.0 m; axles
                   2.69 m from the nose, wheelbase 6.70 + 1.47 m (tag), rear
                   overhang 3.14 m (MAN brochure). Two glazed decks with a
                   painted band between, rabbit-ear mirrors.
     US tour bus   Prevost H3-45 entertainer: 13.72 × 2.59 × 3.72 m; front
                   overhang 1.91 m, wheelbase 7.96 m, rear overhang 2.75 m,
                   floor 1.6 m (Prevost spec sheet). Raked screen, low driver's
                   window, front + rear lounge glass, bunks between.
     EU truck      Cab-over tractor (DAF XF class) + 13.6 m box semi on a
                   tri-axle of super singles.
     US truck      Long-hood sleeper tractor with stacks and chrome tanks +
                   53 ft × 102 in × 13 ft 6 in dry van, tandem duals; fifth
                   wheel at 47 in (Hale / Hyundai Translead sheets).
     Sprinter      L4 high roof: 7.37 m, wheelbase 4.325 m, front overhang
                   1.02 m, 235/65 R16 tyres (Mercedes data via CarExpert).
     Vito          Tourer extra long: 5.37 × 1.93 × 1.91 m, glazed all round,
                   tailgate.
     Luton         Transit-class chassis cab + box with the peak over the cab,
                   roller shutter, tail lift.
     Box truck US  Medium-duty conventional + 26 ft box with an attic over the
                   cab (the rental-truck look).
     Bandwagon     Freightliner M2-class front + living box over the cab
                   (toter-home shape), windows, rear garage.
   Proportions not in a cited sheet are typical, by eye from photographs.

   Pure: no Cesium. Output is a Mesh in the vehicle frame (mesh3d.ts);
   scene3d.ts places it and colours it.
   ============================================ */

import { vehicleSpec, type VehicleType } from './catalogue';
import {
  arch,
  beam,
  box,
  cylAlong,
  cylUp,
  endPanel,
  loft,
  MeshBuilder,
  roundBox,
  sideDisc,
  sidePanel,
  topPanel,
  wheels,
  type Face,
  type Mesh,
} from './mesh3d';

/** Top of a tractor's fifth wheel (47 in — US trailer spec sheets). */
export const FIFTH_WHEEL_M = 1.2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ── Paint helpers (which way a face looks, where it is) ───── */

const isFront = (q: Face) => q.n[0] < -0.3;
const isBack = (q: Face) => q.n[0] > 0.55;
const isSide = (q: Face) => Math.abs(q.n[1]) > 0.7 && Math.abs(q.n[0]) < 0.5;
const inZ = (q: Face, a: number, b: number) => q.z > a && q.z < b;
const inF = (q: Face, runs: [number, number][]) => runs.some(([a, b]) => q.f > a && q.f < b);

/** Window panes from a to b, `pane` long with `gap` pillars between. */
function panes(a: number, b: number, pane: number, gap: number): [number, number][] {
  const out: [number, number][] = [];
  if (b - a < 0.2) return out;
  const n = Math.max(1, Math.round((b - a + gap) / (pane + gap)));
  const p = (b - a - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) out.push([a + i * (p + gap), a + i * (p + gap) + p]);
  return out;
}

const edges = (runs: [number, number][]) => runs.flatMap(([a, b]) => [a, b]);

/** Rabbit-ear mirrors (EU coaches): an arm rising off the roof's front
 *  corner, arching forward and down to a head hanging just ahead of the
 *  screen corner. Every piece touches the next, and the arm starts ON the
 *  roof — so nothing floats (Adam: "mirrors don't connect"). */
function rabbitEars(b: MeshBuilder, hw: number, roof: number, H: number): void {
  for (const side of [-1, 1]) {
    const foot: [number, number, number] = [0.75, side * (hw - 0.3), roof - 0.01];
    const apex: [number, number, number] = [0.28, side * (hw - 0.02), Math.min(H, roof + 0.1)];
    const drop: [number, number, number] = [0.06, side * (hw + 0.08), roof - 0.45];
    beam(b, foot, apex, 0.06, 0.05, 'trim');
    beam(b, apex, drop, 0.06, 0.05, 'trim');
    const s0 = side * (hw + 0.02);
    const s1 = side * (hw + 0.2);
    box(b, 0.02, 0.12, Math.min(s0, s1), Math.max(s0, s1), roof - 1.1, roof - 0.43, (n) => (n[0] > 0.5 ? 'glass' : 'trim'));
  }
}

/** Coach side mirrors on the front pillars (Prevost): a short arm out of the
 *  corner at the top of the screen, a big chrome head below it. */
function pillarMirrors(b: MeshBuilder, hw: number, zTop: number, f: number): void {
  for (const side of [-1, 1]) {
    const s0 = side * (hw + 0.1);
    const s1 = side * (hw + 0.3);
    beam(b, [f + 0.08, side * (hw - 0.03), zTop], [f, side * (hw + 0.2), zTop], 0.05, 0.05, 'trim');
    box(b, f - 0.06, f + 0.06, Math.min(s0, s1), Math.max(s0, s1), zTop - 0.62, zTop, (n) => (n[0] > 0.5 ? 'glass' : 'metal'));
  }
}

/** A flat convex polygon on a SIDE (s = ±at), facing out — (f, z) points. */
function sidePoly(b: MeshBuilder, at: number, pts: [number, number][], m: 'glass'): void {
  const side = Math.sign(at) || 1;
  for (let i = 1; i + 1 < pts.length; i++) {
    b.tri([pts[0][0], at, pts[0][1]], [pts[i][0], at, pts[i][1]], [pts[i + 1][0], at, pts[i + 1][1]], m, [0, side, 0]);
  }
}

/** Door mirrors on arms (vans, trucks): head at f0..f1, z0..z1, out to hw + out. */
function doorMirrors(b: MeshBuilder, hw: number, f0: number, f1: number, z0: number, z1: number, out: number): void {
  for (const side of [-1, 1]) {
    beam(b, [(f0 + f1) / 2 + 0.05, side * (hw - 0.02), (z0 + z1) / 2], [(f0 + f1) / 2, side * (hw + out - 0.08), (z0 + z1) / 2], 0.04, 0.04, 'trim');
    box(b, f0, f1, side > 0 ? hw + out - 0.12 : -(hw + out), side > 0 ? hw + out : -(hw + out - 0.12), z0, z1, (n) => (n[0] < -0.5 ? 'trim' : n[0] > 0.5 ? 'glass' : 'trim'));
  }
}

/** Side marker lamps (amber) along a lower rail. */
function markers(b: MeshBuilder, hw: number, f0: number, f1: number, z: number, every: number): void {
  for (const side of [-1, 1]) for (let f = f0; f <= f1 + 1e-6; f += every) sidePanel(b, side * (hw + 0.006), f, f + 0.08, z, z + 0.05, 'amber');
}

/* ── Coaches ───────────────────────────────────────────────── */

/** Neoplan Skyliner-class double-deck nightliner. */
function coachEU(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const k = L / 14;
  const roof = H - 0.14;
  const lowS = 0.3 * H; // lower-deck sill / top
  const lowT = 0.5 * H;
  const upS = 0.61 * H; // upper deck
  const upT = roof - 0.32;
  const fa = 2.69 * k;
  const fd = (2.69 + 6.7) * k;
  const ft = (2.69 + 6.7 + 1.47) * k;
  const tyre = clamp(0.54, 0.3, H * 0.15);
  const lower = panes(0.55, L - 3.3 * k, 1.75, 0.1);
  // Upper deck: ONE continuous band, as on a Setra / Skyliner nightliner.
  const upper: [number, number][] = [[0.6, L - 0.85]];
  const door: [number, number] = [0.95, 1.95];
  loft(
    b,
    [
      { f: 0, z0: 0.55, z1: roof - 0.6, hw: hw - 0.42, rt: 0.35, rb: 0.12 },
      { f: 0.12, z0: 0.42, z1: roof - 0.3, hw: hw - 0.14, rt: 0.42, rb: 0.12 },
      { f: 0.48, z0: 0.38, z1: roof, hw, rt: 0.32, rb: 0.1 },
      { f: L - 0.5, z0: 0.38, z1: roof, hw, rt: 0.32, rb: 0.1 },
      { f: L - 0.1, z0: 0.42, z1: roof - 0.18, hw: hw - 0.1, rt: 0.3, rb: 0.1 },
      { f: L, z0: 0.5, z1: roof - 0.42, hw: hw - 0.32, rt: 0.25, rb: 0.1 },
    ],
    {
      segs: 5,
      zBreaks: [0.62, lowS, lowT, upS, upT],
      fBreaks: [...edges(lower), ...edges(upper), ...door],
      paint: (q) => {
        if (isFront(q)) {
          if (q.z < 0.62) return 'trim';
          if (inZ(q, lowS - 0.05, lowT) || q.z > upS) return 'glass';
          return 'body';
        }
        if (isBack(q)) return inZ(q, upS, upT) ? 'glass' : 'body';
        if (isSide(q)) {
          if (q.s > 0 && q.f > door[0] && q.f < door[1] && q.z < lowT) return 'glass';
          if (inZ(q, lowS, lowT) && inF(q, lower)) return 'glass';
          if (inZ(q, upS, upT) && inF(q, upper)) return 'glass';
          if (q.z < 0.45) return 'shade';
        }
        return 'body';
      },
    },
  );
  // The rear stair glass (Adam's Setra S 431 DT photo, both sides): over the
  // back axles the glass sweeps up from the lower windows into the upper band,
  // its front edge raked back as it rises. The silver swoosh on the photo is
  // livery and isn't drawn.
  const stair = L - 3.3 * k - 0.45;
  for (const side of [-1, 1]) {
    sidePoly(b, side * (hw + 0.004), [[stair, lowT - 0.04], [L - 0.85, lowT - 0.04], [L - 0.85, upS + 0.04], [stair + 0.75, upS + 0.04]], 'glass');
  }
  // Roof: air-con pod, hatches.
  roundBox(b, L * 0.36, L * 0.62, 0, hw * 0.72, roof - 0.02, H, 0.08, 'pale');
  topPanel(b, roof + 0.004, L * 0.18, L * 0.18 + 0.7, -0.35, 0.35, 'trim');
  topPanel(b, roof + 0.004, L * 0.75, L * 0.75 + 0.7, -0.35, 0.35, 'trim');
  rabbitEars(b, hw, roof, H);
  // Front: lamps; back: tail lamps, engine grille.
  for (const side of [-1, 1]) {
    endPanel(b, -0.004, -1, side * (hw - 0.92), side * (hw - 0.5), 0.66, 0.84, 'lamp');
    endPanel(b, -0.005, -1, side * (hw - 0.5), side * (hw - 0.44), 0.66, 0.84, 'amber');
    endPanel(b, L + 0.004, 1, side * (hw - 0.62), side * (hw - 0.36), 0.95, lowT, 'tail');
  }
  endPanel(b, L + 0.004, 1, -(hw - 0.75), hw - 0.75, 0.62, 0.9, 'trim');
  // Engine-bay louvres and luggage-bay seams.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) sidePanel(b, side * (hw + 0.005), L - 2.7 * k, L - 0.9, 0.6 + i * 0.09, 0.64 + i * 0.09, 'trim');
    for (const f of [fa + 0.9, (fa + fd) / 2, fd - 0.9]) sidePanel(b, side * (hw + 0.005), f, f + 0.03, 0.42, lowS - 0.06, 'trim');
  }
  for (const [f, dual] of [[fa, false], [fd, true], [ft, false]] as const) {
    arch(b, hw, f, tyre, 0.38);
    wheels(b, { f, r: tyre, outer: hw + 0.004, width: dual ? 0.62 : 0.34, dual });
  }
}

/** Prevost H3-45-class entertainer coach. */
function coachUS(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const k = L / 13.72;
  const roof = H - 0.08;
  const fa = 1.91 * k;
  const fd = (1.91 + 7.96) * k;
  const ft = L - 2.75 * k;
  const tyre = clamp(0.53, 0.3, H * 0.15);
  const drvS = 0.31 * H; // driver's window (lower)
  const paxS = 0.47 * H; // passenger deck (floor 1.6 m)
  const winT = roof - 0.48;
  const front = panes(fa + 0.62, Math.min(L * 0.46, fd - 1.5), 1.6, 0.12);
  const rear = panes(fd - 1.3 - 2.2 * k, fd - 1.0, 1.05, 0.1);
  // Prevost (Adam's photo): the entrance door is on the RIGHT, AHEAD of the
  // front wheel; the driver's window is opposite it on the left.
  const driver: [number, number] = [0.5, fa - 0.55];
  const door: [number, number] = [0.5, fa - 0.62];
  const bays = 1.15; // stainless baggage-bay band below this
  loft(
    b,
    [
      // Prevost H3 / X3: a squared front — the bumper nearly full width, the
      // screen leaning back only a few degrees, square roof edges.
      { f: 0, z0: 0.45, z1: 1.15, hw: hw - 0.12, rt: 0.08, rb: 0.08 },
      { f: 0.1, z0: 0.32, z1: 1.45, hw: hw - 0.04, rt: 0.12, rb: 0.08 },
      { f: 0.3, z0: 0.3, z1: roof - 0.22, hw, rt: 0.22, rb: 0.08 },
      { f: 0.5, z0: 0.3, z1: roof, hw, rt: 0.24, rb: 0.08 },
      { f: L - 0.3, z0: 0.3, z1: roof, hw, rt: 0.24, rb: 0.08 },
      { f: L, z0: 0.45, z1: roof - 0.22, hw: hw - 0.08, rt: 0.2, rb: 0.1 },
    ],
    {
      segs: 5,
      zBreaks: [0.7, bays, drvS, paxS, winT],
      fBreaks: [...edges(front), ...edges(rear), ...driver, ...door],
      paint: (q) => {
        if (isFront(q)) return q.z < 0.7 ? 'metal' : q.z > 1.5 && q.z < roof - 0.12 ? 'glass' : 'body';
        if (isBack(q)) return 'body';
        if (isSide(q)) {
          if (q.s < 0 && inZ(q, drvS, winT) && q.f > driver[0] && q.f < driver[1]) return 'glass';
          if (q.s > 0 && q.f > door[0] && q.f < door[1] && inZ(q, bays, winT)) return 'glass';
          if (inZ(q, paxS, winT) && inF(q, front)) return 'glass';
          if (inZ(q, paxS, winT) && inF(q, rear)) return 'glass';
          if (q.z < bays && q.f > 0.4) return 'metal';
        }
        return 'body';
      },
    },
  );
  // The two-piece screen's centre post.
  beam(b, [0.085, 0, 1.5], [0.275, 0, roof - 0.27], 0.05, 0.04, 'trim');
  // A satellite dome and two hatches: the entertainer roof.
  roundBox(b, L * 0.2, L * 0.2 + 0.9, 0, 0.42, roof - 0.02, H, 0.2, 'pale');
  topPanel(b, roof + 0.004, L * 0.45, L * 0.45 + 0.75, -0.38, 0.38, 'trim');
  topPanel(b, roof + 0.004, L * 0.7, L * 0.7 + 0.75, -0.38, 0.38, 'trim');
  pillarMirrors(b, hw, roof - 1.05, 0.32);
  for (const side of [-1, 1]) {
    endPanel(b, -0.004, -1, side * (hw - 0.98), side * (hw - 0.48), 0.78, 0.98, 'lamp');
    endPanel(b, L + 0.004, 1, side * (hw - 0.55), side * (hw - 0.3), 0.85, 1.7, 'tail');
    // Stainless baggage-bay doors between the axles, a rub strip on top.
    for (let f = fa + 1.4; f < fd - 0.8; f += 1.25) sidePanel(b, side * (hw + 0.005), f, f + 0.025, 0.38, bays - 0.04, 'trim');
    sidePanel(b, side * (hw + 0.005), 0.4, L - 0.3, bays - 0.03, bays, 'trim');
    // Engine-bay louvres.
    for (let i = 0; i < 6; i++) sidePanel(b, side * (hw + 0.005), ft + 0.65, L - 0.3, 0.75 + i * 0.1, 0.79 + i * 0.1, 'trim');
  }
  endPanel(b, L + 0.004, 1, -(hw - 0.7), hw - 0.7, 0.55, 1.45, 'trim');
  sidePanel(b, hw + 0.006, door[0] - 0.03, door[0], 0.42, winT, 'trim');
  sidePanel(b, hw + 0.006, door[1], door[1] + 0.03, 0.42, winT, 'trim');
  for (const [f, dual] of [[fa, false], [fd, true], [ft, false]] as const) {
    arch(b, hw, f, tyre, 0.3);
    wheels(b, { f, r: tyre, outer: hw + 0.004, width: dual ? 0.6 : 0.33, dual });
  }
}

/* ── Towed box trailers (bus, Bandwagon, splitter) ────────── */

/** f = 0 is the hitch; the box runs from `bar` to L. `us` = V-nose. */
function smallTrailer(b: MeshBuilder, L: number, W: number, Ht: number, bar: number, us: boolean): void {
  const hw = W / 2;
  const tyre = clamp(us ? 0.36 : 0.33, 0.22, Ht * 0.2);
  const z0 = tyre + 0.2;
  const body = L - bar;
  const st = us
    ? [
        { f: bar, z0, z1: Ht - 0.08, hw: hw * 0.42, rt: 0.06, rb: 0.03 },
        { f: bar + Math.min(0.55, body * 0.15), z0, z1: Ht, hw, rt: 0.08, rb: 0.03 },
        { f: L, z0, z1: Ht, hw, rt: 0.08, rb: 0.03 },
      ]
    : [
        { f: bar, z0, z1: Ht - 0.04, hw: hw - 0.08, rt: 0.12, rb: 0.03 },
        { f: bar + 0.12, z0, z1: Ht, hw, rt: 0.12, rb: 0.03 },
        { f: L, z0, z1: Ht, hw, rt: 0.12, rb: 0.03 },
      ];
  loft(b, st, { segs: 3, zBreaks: [z0 + 0.1], paint: (q) => (q.n[2] > 0.75 ? 'pale' : q.z < z0 + 0.1 && isSide(q) ? 'trim' : 'body') });
  // Ramp / doors at the back: frame, hinge, latches, lamps.
  endPanel(b, L + 0.004, 1, -(hw - 0.08), hw - 0.08, z0 + 0.06, z0 + 0.1, 'trim');
  endPanel(b, L + 0.004, 1, -(hw - 0.08), hw - 0.08, Ht - 0.14, Ht - 0.1, 'trim');
  for (const side of [-1, 1]) {
    endPanel(b, L + 0.004, 1, side * (hw - 0.12), side * (hw - 0.08), z0 + 0.06, Ht - 0.1, 'trim');
    endPanel(b, L + 0.006, 1, side * (hw - 0.3), side * (hw - 0.22), z0 + (Ht - z0) * 0.5, z0 + (Ht - z0) * 0.5 + 0.18, 'metal');
    endPanel(b, L + 0.004, 1, side * (hw - 0.07), side * (hw - 0.01), z0 - 0.02, z0 + 0.12, 'tail');
    sidePanel(b, side * (hw + 0.006), bar + 0.15, bar + 0.22, Ht - 0.2, Ht - 0.14, 'amber');
    sidePanel(b, side * (hw + 0.006), L - 0.22, L - 0.15, Ht - 0.2, Ht - 0.14, 'tail');
  }
  // A-frame drawbar, coupler, jockey wheel.
  for (const side of [-1, 1]) beam(b, [0.25, 0, z0 - 0.1], [bar + 0.05, side * (hw * 0.62), z0 - 0.1], 0.08, 0.1, 'trim');
  box(b, 0, 0.3, -0.07, 0.07, z0 - 0.18, z0 - 0.02, 'metal');
  cylUp(b, 0.55, 0.12, 0.035, 0.08, z0 - 0.1, 8, 'trim');
  cylUp(b, 0.55, 0.12, 0.08, 0, 0.08, 10, 'tyre');
  // Axles: tandem a little behind the middle, under polished fenders.
  const mid = bar + body * 0.56;
  const axles = body > 3 ? [mid - 0.42, mid + 0.42] : [mid];
  for (const f of axles) {
    arch(b, hw, f, tyre, z0, 'metal');
    wheels(b, { f, r: tyre, outer: hw - 0.02, width: 0.22 });
  }
}

/* ── Trucks ────────────────────────────────────────────────── */

/** Cab-over tractor (DAF XF / Scania R class). L = the tractor's length. */
function cabOverTractor(b: MeshBuilder, L: number, W: number, H: number): number {
  const hw = W / 2;
  const cl = clamp(2.3, 1.6, L * 0.45);
  const Hc = Math.min(H, 3.95);
  const tyre = clamp(0.51, 0.3, H * 0.14);
  const fa = clamp(1.4, 0.8, cl - 0.55);
  const drive = Math.max(cl + 0.9, L - 0.95);
  const screen0 = Hc * 0.45;
  const screen1 = Hc * 0.7;
  loft(
    b,
    [
      { f: 0, z0: 0.45, z1: Hc - 0.35, hw: hw - 0.1, rt: 0.25, rb: 0.05 },
      { f: 0.07, z0: 0.42, z1: Hc - 0.12, hw: hw - 0.03, rt: 0.3, rb: 0.05 },
      { f: 0.32, z0: 0.42, z1: Hc, hw, rt: 0.3, rb: 0.05 },
      { f: cl, z0: 0.42, z1: Hc, hw, rt: 0.25, rb: 0.05 },
    ],
    {
      segs: 4,
      zBreaks: [0.75, 0.86, Hc * 0.42, screen0, screen1, screen1 + 0.12],
      fBreaks: [0.38, 1.3],
      paint: (q) => {
        if (isFront(q)) {
          if (q.z < 0.75) return 'trim';
          if (inZ(q, 0.86, Hc * 0.42)) return 'trim';
          if (inZ(q, screen0, screen1)) return 'glass';
          if (inZ(q, screen1, screen1 + 0.12)) return 'trim';
          return 'body';
        }
        if (isSide(q)) {
          if (q.f > 0.38 && q.f < 1.3 && inZ(q, screen0 + 0.05, screen1 - 0.05)) return 'glass';
          if (q.z < Hc * 0.3 && q.f > 0.4) return 'shade';
        }
        return 'body';
      },
    },
  );
  // Grille slats, lamps, steps, door seams.
  for (let i = 0; i < 4; i++) endPanel(b, -0.006, -1, -(hw - 0.42), hw - 0.42, 0.95 + i * 0.17, 0.99 + i * 0.17, 'metal');
  for (const side of [-1, 1]) {
    endPanel(b, -0.006, -1, side * (hw - 0.78), side * (hw - 0.28), 0.52, 0.68, 'lamp');
    endPanel(b, -0.007, -1, side * (hw - 0.28), side * (hw - 0.16), 0.52, 0.68, 'amber');
    sidePanel(b, side * (hw + 0.005), 1.32, 1.35, 0.95, Hc * 0.72, 'trim');
    sidePanel(b, side * (hw + 0.005), 0.36, 0.39, 0.95, Hc * 0.72, 'trim');
    for (const z of [0.55, 0.8]) box(b, 0.45, 1.1, side > 0 ? hw - 0.02 : -hw - 0.02, side > 0 ? hw + 0.02 : -hw + 0.02, z, z + 0.04, 'metal');
  }
  doorMirrors(b, hw, 0.22, 0.36, Hc * 0.48, Hc * 0.68, 0.36);
  // Chassis, fifth wheel, tanks, mudguards, rear lamp bar.
  box(b, cl - 0.2, L - 0.05, -0.48, 0.48, 0.8, 1.04, 'trim');
  const plate = Math.max(cl + 0.3, drive - 0.75);
  box(b, plate, Math.min(L - 0.05, plate + 1.15), -0.62, 0.62, FIFTH_WHEEL_M - 0.16, FIFTH_WHEEL_M, 'metal');
  box(b, plate + 0.55, Math.min(L - 0.05, plate + 1.16), -0.08, 0.08, FIFTH_WHEEL_M - 0.15, FIFTH_WHEEL_M + 0.002, 'trim');
  roundBox(b, cl + 0.12, Math.min(drive - 0.65, cl + 1.5), -(hw - 0.32), 0.3, 0.45, 1.05, 0.12, 'metal');
  roundBox(b, cl + 0.12, Math.min(drive - 0.65, cl + 0.9), hw - 0.3, 0.28, 0.5, 1.02, 0.04, 'trim');
  for (const side of [-1, 1]) {
    box(b, drive - 0.62, drive + 0.62, side > 0 ? hw - 0.62 : -hw + 0.02, side > 0 ? hw - 0.02 : -hw + 0.62, tyre * 2 + 0.06, tyre * 2 + 0.1, 'trim');
    box(b, L - 0.12, L - 0.04, side > 0 ? hw - 0.62 : -hw + 0.04, side > 0 ? hw - 0.04 : -hw + 0.62, 0.15, tyre * 2, 'trim');
    endPanel(b, L + 0.002, 1, side * (hw - 0.5), side * (hw - 0.2), 0.62, 0.74, 'tail');
  }
  box(b, L - 0.12, L, -(hw - 0.15), hw - 0.15, 0.6, 0.76, 'trim');
  arch(b, hw, fa, tyre, 0.42);
  wheels(b, { f: fa, r: tyre, outer: hw - 0.02, width: 0.33 });
  wheels(b, { f: drive, r: tyre, outer: hw - 0.05, width: 0.6, dual: true });
  return cl;
}

interface ConvOpts {
  hood: number;
  cab: number;
  sleeper: number;
  /** Hood top, cab roof, sleeper roof. */
  hh: number;
  Hcab: number;
  Hs: number;
  tyre: number;
  stacks: boolean;
  tanks: boolean;
}

/** A US conventional front: bumper, long hood, fenders, cab, optional sleeper.
 *  Returns where the cab (or sleeper) ends. */
function conventionalFront(b: MeshBuilder, W: number, H: number, o: ConvOpts): number {
  const hw = W / 2;
  const fw = clamp(o.hood * 0.5, 0.9, 1.25);
  // Chrome bumper.
  roundBox(b, 0, 0.22, 0, hw - 0.08, 0.42, 0.74, 0.06, 'metal');
  // Hood: narrower than the cab, rising to the screen.
  const hn = hw * 0.64;
  loft(
    b,
    [
      { f: 0.18, z0: 0.66, z1: o.hh - 0.55, hw: hn * 0.92, rt: 0.18, rb: 0.04 },
      { f: 0.4, z0: 0.64, z1: o.hh - 0.35, hw: hn, rt: 0.24, rb: 0.04 },
      { f: o.hood, z0: 0.64, z1: o.hh, hw: hn * 1.08, rt: 0.26, rb: 0.04 },
    ],
    { segs: 4, paint: (q) => (isFront(q) && Math.abs(q.s) < hn * 0.8 && q.f < 0.3 ? 'metal' : 'body') },
  );
  for (let s = -hn * 0.7; s <= hn * 0.7 + 1e-6; s += hn * 0.175) endPanel(b, 0.174, -1, s - 0.02, s + 0.02, 0.76, o.hh - 0.66, 'trim');
  // Fenders over the front wheels, headlamps in their noses.
  for (const side of [-1, 1]) {
    const sc = side * (hw - 0.21);
    roundBox(b, fw - 0.78, fw + 0.62, sc, 0.21, o.tyre * 1.55, o.tyre * 2.35, 0.12, 'body');
    endPanel(b, fw - 0.784, -1, sc - 0.15, sc + 0.15, o.tyre * 1.85, o.tyre * 2.15, 'lamp');
    endPanel(b, fw - 0.786, -1, sc - 0.15, sc + 0.15, o.tyre * 1.62, o.tyre * 1.75, 'amber');
    sideDisc(b, side * (hw + 0.004), fw, o.tyre, o.tyre * 1.12, 12, 'trim', 0, Math.PI);
  }
  // Cab (+ sleeper with its roof fairing).
  const c0 = o.hood - 0.02;
  const c1 = o.hood + o.cab;
  const st = [
    { f: c0, z0: 0.95, z1: o.hh + 0.15, hw: hw - 0.06, rt: 0.2, rb: 0.05 },
    { f: o.hood + 0.72, z0: 0.95, z1: o.Hcab, hw, rt: 0.26, rb: 0.05 },
    { f: c1, z0: 0.95, z1: o.Hcab, hw, rt: 0.26, rb: 0.05 },
  ];
  if (o.sleeper > 0) {
    st.push({ f: c1 + Math.min(0.9, o.sleeper * 0.5), z0: 0.95, z1: o.Hs, hw, rt: 0.3, rb: 0.05 });
    st.push({ f: c1 + o.sleeper, z0: 0.95, z1: o.Hs, hw, rt: 0.3, rb: 0.05 });
  }
  const scr0 = o.hh + 0.2;
  const door: [number, number] = [o.hood + 0.3, c1 - 0.12];
  loft(b, st, {
    segs: 4,
    zBreaks: [scr0, o.Hcab - 0.14],
    fBreaks: [...door, o.hood + 0.72],
    paint: (q) => {
      if (isFront(q) && q.f < o.hood + 0.75 && inZ(q, scr0 - 0.02, o.Hcab - 0.1)) return 'glass';
      if (isSide(q) && q.f > door[0] && q.f < door[1] && inZ(q, scr0, o.Hcab - 0.14)) return 'glass';
      if (isFront(q) && q.f > c1 - 0.05) return 'shade'; // the fairing up to the sleeper roof
      return 'body';
    },
  });
  // Sun visor, cab marker lamps, door seams, west-coast mirrors.
  box(b, o.hood + 0.66, o.hood + 0.86, -(hw - 0.1), hw - 0.1, o.Hcab - 0.12, o.Hcab - 0.04, 'trim');
  if (o.Hcab + 0.05 <= H) for (let i = -2; i <= 2; i++) box(b, o.hood + 0.8, o.hood + 0.88, i * 0.32 - 0.05, i * 0.32 + 0.05, o.Hcab, o.Hcab + 0.05, 'amber');
  for (const side of [-1, 1]) {
    sidePanel(b, side * (hw + 0.005), door[0] - 0.03, door[0], 1.0, o.Hcab - 0.14, 'trim');
    sidePanel(b, side * (hw + 0.005), door[1], door[1] + 0.03, 1.0, o.Hcab - 0.14, 'trim');
  }
  doorMirrors(b, hw, o.hood + 0.08, o.hood + 0.16, o.hh - 0.05, o.Hcab - 0.35, 0.34);
  const end = c1 + o.sleeper;
  // Chrome fuel tanks under the doors / sleeper.
  if (o.tanks) for (const side of [-1, 1]) cylAlong(b, o.hood + 0.2, Math.min(end + 0.2, o.hood + o.cab + 1.3), side * (hw - 0.34), o.tyre * 1.4, 0.3, 14, 'metal');
  // Stacks behind the cab.
  if (o.stacks) for (const side of [-1, 1]) cylUp(b, end + 0.12, side * (hw - 0.14), 0.085, 0.95, Math.min(H, Math.max(o.Hs, o.Hcab) + 0.35), 12, 'metal');
  // Steps.
  for (const side of [-1, 1]) for (const z of [0.5, 0.78]) box(b, o.hood + 0.12, o.hood + 0.55, side > 0 ? hw - 0.03 : -hw - 0.01, side > 0 ? hw + 0.01 : -hw + 0.03, z, z + 0.04, 'metal');
  arch(b, hw, fw, o.tyre, 0.95);
  wheels(b, { f: fw, r: o.tyre, outer: hw - 0.04, width: 0.32 });
  return end;
}

/** Long-hood sleeper tractor (US). L = the tractor's length. */
function usTractor(b: MeshBuilder, L: number, W: number, H: number): number {
  const hw = W / 2;
  const tyre = clamp(0.51, 0.3, H * 0.13);
  const k = Math.min(1, L / 8.3);
  const end = conventionalFront(b, W, H, { hood: 2.25 * k, cab: 1.85 * k, sleeper: 1.9 * k, hh: 1.9, Hcab: Math.min(H, 3.05), Hs: Math.min(H - 0.05, 4.0), tyre, stacks: true, tanks: true });
  const rear = Math.min(L - tyre - 0.1, Math.max(end + 0.85, L - 1.15));
  box(b, end - 0.1, L - 0.05, -0.47, 0.47, 0.82, 1.06, 'trim');
  const plate = Math.max(end + 0.2, rear - 1.3);
  box(b, plate, Math.min(L - 0.05, plate + 1.15), -0.62, 0.62, FIFTH_WHEEL_M - 0.16, FIFTH_WHEEL_M, 'metal');
  box(b, plate + 0.55, Math.min(L - 0.05, plate + 1.16), -0.08, 0.08, FIFTH_WHEEL_M - 0.15, FIFTH_WHEEL_M + 0.002, 'trim');
  for (const side of [-1, 1]) {
    // Chrome quarter fenders over the tandem, mud flaps behind it.
    box(b, rear - 1.32 - 0.55, rear + 0.55, side > 0 ? hw - 0.62 : -hw + 0.02, side > 0 ? hw - 0.02 : -hw + 0.62, tyre * 2 + 0.06, tyre * 2 + 0.1, 'metal');
    box(b, Math.min(L - 0.06, rear + 0.62), Math.min(L - 0.02, rear + 0.66), side > 0 ? hw - 0.62 : -hw + 0.05, side > 0 ? hw - 0.05 : -hw + 0.62, 0.18, tyre * 2, 'trim');
  }
  for (const f of [rear - 1.32, rear]) wheels(b, { f, r: tyre, outer: hw - 0.04, width: 0.6, dual: true });
  return end;
}

/** A box semi-trailer. f = 0 at its nose. */
function semiTrailer(b: MeshBuilder, L: number, W: number, H: number, us: boolean): void {
  const hw = W / 2;
  const floor = us ? 1.25 : 1.22;
  const tyre = us ? 0.5 : 0.535;
  loft(b, [{ f: 0, z0: floor, z1: H, hw, rt: 0.06, rb: 0.02 }, { f: L, z0: floor, z1: H, hw, rt: 0.06, rb: 0.02 }], {
    segs: 2,
    zBreaks: [floor + 0.12, H - 0.12],
    // A pale roof (most box trailers' are translucent white): from above, the
    // trailer reads apart from its cab.
    paint: (q) => (q.n[2] > 0.75 ? 'pale' : isSide(q) && (q.z < floor + 0.12 || q.z > H - 0.12) ? 'shade' : 'body'),
  });
  // Posts (US plate trailers show them), rails, side markers.
  if (us) for (let f = 1.2; f < L - 0.5; f += 1.22) for (const side of [-1, 1]) sidePanel(b, side * (hw + 0.004), f, f + 0.05, floor + 0.12, H - 0.12, 'shade');
  markers(b, hw, 0.6, L - 0.6, floor + 0.03, us ? 3.0 : 2.4);
  for (const side of [-1, 1]) box(b, 0, L, side > 0 ? hw - 0.1 : -hw, side > 0 ? hw : -hw + 0.1, floor - 0.18, floor, 'trim');
  // Rear doors: seam, frame, lock rods, hinges; tail lamps on the bumper.
  endPanel(b, L + 0.004, 1, -0.015, 0.015, floor + 0.05, H - 0.1, 'trim');
  endPanel(b, L + 0.004, 1, -(hw - 0.04), hw - 0.04, H - 0.14, H - 0.06, 'trim');
  for (const side of [-1, 1]) {
    endPanel(b, L + 0.004, 1, side * (hw - 0.1), side * (hw - 0.04), floor, H - 0.06, 'trim');
    for (const s of [0.3, 0.9]) endPanel(b, L + 0.006, 1, side * s - 0.02, side * s + 0.02, floor + 0.12, H - 0.2, 'metal');
    for (let i = 0; i < 4; i++) {
      const z = floor + 0.2 + (i * (H - floor - 0.45)) / 3;
      endPanel(b, L + 0.006, 1, side * (hw - 0.2), side * (hw - 0.06), z, z + 0.1, 'metal');
    }
    endPanel(b, L + 0.004, 1, side * (hw - 0.1), side * (hw - 0.02), H - 0.16, H - 0.06, 'tail');
  }
  box(b, L - 0.3, L - 0.08, -(hw - 0.12), hw - 0.12, 0.42, 0.6, 'trim');
  for (const side of [-1, 1]) endPanel(b, L - 0.076, 1, side * (hw - 0.4), side * (hw - 0.14), 0.44, 0.58, 'tail');
  // Landing gear.
  const lg = us ? 3.5 : 2.9;
  for (const side of [-1, 1]) {
    box(b, lg, lg + 0.12, side * 0.62 - 0.06, side * 0.62 + 0.06, 0.12, floor - 0.12, 'trim');
    box(b, lg - 0.08, lg + 0.2, side * 0.62 - 0.12, side * 0.62 + 0.12, 0, 0.12, 'trim');
  }
  // Axles, sub-frame, mud flaps, side guards / skirts.
  const axles = us ? [L - 2.75, L - 1.5] : [L - 4.65, L - 3.34, L - 2.03];
  box(b, axles[0] - 0.8, axles[axles.length - 1] + 0.6, -0.55, 0.55, tyre + 0.05, floor - 0.18, 'trim');
  for (const f of axles) wheels(b, { f, r: tyre, outer: hw - 0.04, width: us ? 0.6 : 0.4, dual: us });
  for (const side of [-1, 1]) {
    const last = axles[axles.length - 1];
    box(b, last + 0.62, last + 0.66, side > 0 ? hw - 0.6 : -hw + 0.04, side > 0 ? hw - 0.04 : -hw + 0.6, 0.18, floor - 0.2, 'trim');
    if (us) box(b, lg + 0.7, axles[0] - 0.75, side > 0 ? hw - 0.06 : -hw + 0.03, side > 0 ? hw - 0.03 : -hw + 0.06, 0.34, floor - 0.18, 'shade');
    else for (const z of [0.55, 0.85]) box(b, lg + 0.4, axles[0] - 0.7, side > 0 ? hw - 0.07 : -hw + 0.03, side > 0 ? hw - 0.03 : -hw + 0.07, z, z + 0.06, 'metal');
  }
}

/* ── Vans ──────────────────────────────────────────────────── */

/** Mercedes Sprinter L4 high roof (crew windows behind the cab when `crew`). */
function sprinter(b: MeshBuilder, L: number, W: number, H: number, crew: boolean): void {
  const hw = W / 2;
  const k = L / 7.37;
  const fa = 1.02 * k;
  const fr = L - 2.18 * k;
  const tyre = clamp(0.356, 0.25, H * 0.14);
  const belt = 1.18;
  const top = Math.min(2.02, H - 0.55);
  const cabWin: [number, number] = [0.98, 1.78];
  const crewWin = crew ? panes(1.98, Math.min(L - 2.6, 3.9), 0.9, 0.1) : [];
  loft(
    b,
    [
      { f: 0, z0: 0.38, z1: 0.78, hw: hw - 0.25, rt: 0.15, rb: 0.08 },
      { f: 0.18, z0: 0.32, z1: 0.98, hw: hw - 0.12, rt: 0.2, rb: 0.08 },
      { f: 0.72, z0: 0.3, z1: belt, hw: hw - 0.06, rt: 0.25, rb: 0.06 },
      { f: 1.42, z0: 0.3, z1: top, hw: hw - 0.02, rt: 0.3, rb: 0.06 },
      { f: 1.9, z0: 0.3, z1: H, hw, rt: 0.32, rb: 0.06 },
      { f: L - 0.12, z0: 0.3, z1: H, hw, rt: 0.3, rb: 0.06 },
      { f: L, z0: 0.36, z1: H - 0.06, hw: hw - 0.03, rt: 0.28, rb: 0.06 },
    ],
    {
      segs: 4,
      zBreaks: [0.62, belt, top - 0.06],
      fBreaks: [...cabWin, ...edges(crewWin), 0.35, L - 0.3],
      paint: (q) => {
        if (q.z < 0.62 && (q.f < 0.35 || q.f > L - 0.3)) return 'trim';
        if (isFront(q)) return q.f > 0.6 && q.f < 1.5 && q.z > belt - 0.02 ? 'glass' : 'body';
        if (isSide(q)) {
          if (inZ(q, belt + 0.03, top - 0.06) && (inF(q, [cabWin]) || inF(q, crewWin))) return 'glass';
          if (q.z < 0.42) return 'trim';
        }
        return 'body';
      },
    },
  );
  // Grille, star, headlamps.
  roundBox(b, 0.05, 0.22, 0, 0.42, 0.6, 0.9, 0.04, 'trim');
  for (let i = 0; i < 3; i++) endPanel(b, 0.046, -1, -0.36, 0.36, 0.66 + i * 0.08, 0.68 + i * 0.08, 'metal');
  for (const side of [-1, 1]) {
    roundBox(b, 0.1, 0.26, side * (hw - 0.3), 0.19, 0.8, 0.88, 0.02, 'lamp');
    // Rear: door windows, lamp pillars, seam.
    endPanel(b, L + 0.004, 1, side * 0.06, side * (hw - 0.22), 1.32, top - 0.08, 'glass');
    endPanel(b, L + 0.004, 1, side * (hw - 0.16), side * (hw - 0.05), 0.62, 1.52, 'tail');
    // Sliding door (right) / cab door seams.
    sidePanel(b, side * (hw + 0.005), 1.82, 1.85, 0.42, top - 0.04, 'trim');
    sidePanel(b, side * (hw + 0.005), 0.95, 0.98, 0.5, top - 0.04, 'trim');
  }
  sidePanel(b, hw + 0.005, 3.22 * k, 3.25 * k, 0.42, top - 0.04, 'trim');
  endPanel(b, L + 0.004, 1, -0.012, 0.012, 0.42, H - 0.12, 'trim');
  doorMirrors(b, hw, 1.0, 1.14, 1.3, 1.68, 0.24);
  for (const f of [fa, fr]) {
    arch(b, hw, f, tyre, 0.3);
    wheels(b, { f, r: tyre, outer: hw - 0.06, width: 0.24 });
  }
}

/** Mercedes Vito Tourer extra long. */
function vito(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const k = L / 5.37;
  const tyre = clamp(0.345, 0.22, H * 0.2);
  const belt = 1.02;
  const top = H - 0.14;
  const pillars = [1.96 * k, 3.26 * k, 4.36 * k];
  const win: [number, number][] = [];
  let a = 1.02;
  for (const p of pillars) {
    win.push([a, p - 0.05]);
    a = p + 0.07;
  }
  win.push([a, L - 0.32]);
  loft(
    b,
    [
      { f: 0, z0: 0.3, z1: 0.62, hw: hw - 0.25, rt: 0.15, rb: 0.06 },
      { f: 0.2, z0: 0.25, z1: 0.82, hw: hw - 0.1, rt: 0.2, rb: 0.06 },
      { f: 0.95, z0: 0.22, z1: belt, hw: hw - 0.06, rt: 0.25, rb: 0.06 },
      { f: 1.95 * k, z0: 0.22, z1: H - 0.04, hw: hw - 0.08, rt: 0.36, rb: 0.06 },
      { f: 2.3 * k, z0: 0.22, z1: H, hw: hw - 0.06, rt: 0.36, rb: 0.06 },
      { f: L - 0.25, z0: 0.22, z1: H - 0.02, hw: hw - 0.04, rt: 0.33, rb: 0.06 },
      { f: L, z0: 0.3, z1: H - 0.12, hw: hw - 0.08, rt: 0.3, rb: 0.06 },
    ],
    {
      segs: 5,
      zBreaks: [0.55, belt, top],
      fBreaks: [...edges(win), 0.35, L - 0.3],
      paint: (q) => {
        if (q.z < 0.55 && (q.f < 0.35 || q.f > L - 0.3)) return 'trim';
        if (isFront(q)) return q.f > 0.8 && q.z > belt - 0.02 ? 'glass' : 'body';
        if (isSide(q) && inZ(q, belt + 0.02, top) && inF(q, win)) return 'glass';
        return 'body';
      },
    },
  );
  roundBox(b, 0.05, 0.22, 0, 0.36, 0.48, 0.72, 0.04, 'trim');
  for (const side of [-1, 1]) {
    roundBox(b, 0.12, 0.3, side * (hw - 0.31), 0.17, 0.7, 0.78, 0.02, 'lamp');
    endPanel(b, L + 0.004, 1, side * (hw - 0.28), side * (hw - 0.12), 0.78, 1.3, 'tail');
    sidePanel(b, side * (hw + 0.005), 1.94 * k, 1.97 * k, 0.32, belt + 0.02, 'trim');
  }
  endPanel(b, L + 0.004, 1, -(hw - 0.3), hw - 0.3, 1.12, H - 0.24, 'glass');
  doorMirrors(b, hw, 1.05, 1.18, 0.95, 1.18, 0.2);
  for (const f of [0.95 * k, L - 1.0 * k]) {
    arch(b, hw, f, tyre, 0.22);
    wheels(b, { f, r: tyre, outer: hw - 0.05, width: 0.22 });
  }
}

/** A chassis-cab front (Transit / medium-duty cab-over-engine van front).
 *  `hwc` = the cab's half width. Returns where the cab ends. */
function vanCab(b: MeshBuilder, hwc: number, cabTop: number): number {
  const end = 2.12;
  loft(
    b,
    [
      { f: 0, z0: 0.38, z1: 0.82, hw: hwc - 0.25, rt: 0.15, rb: 0.08 },
      { f: 0.2, z0: 0.32, z1: 1.02, hw: hwc - 0.1, rt: 0.2, rb: 0.08 },
      { f: 0.78, z0: 0.3, z1: 1.2, hw: hwc - 0.05, rt: 0.25, rb: 0.06 },
      { f: 1.45, z0: 0.3, z1: cabTop - 0.05, hw: hwc, rt: 0.25, rb: 0.06 },
      { f: end, z0: 0.3, z1: cabTop, hw: hwc, rt: 0.22, rb: 0.06 },
    ],
    {
      segs: 4,
      zBreaks: [0.62, 1.2, cabTop - 0.2],
      fBreaks: [0.92, 1.95, 0.35],
      paint: (q) => {
        if (q.z < 0.62 && q.f < 0.35) return 'trim';
        if (isFront(q)) return q.f > 0.7 && q.z > 1.18 ? 'glass' : 'body';
        if (isSide(q) && q.f > 0.92 && q.f < 1.95 && inZ(q, 1.22, cabTop - 0.2)) return 'glass';
        return 'body';
      },
    },
  );
  roundBox(b, 0.05, 0.24, 0, 0.45, 0.62, 0.92, 0.04, 'trim');
  for (const side of [-1, 1]) roundBox(b, 0.12, 0.3, side * (hwc - 0.3), 0.19, 0.84, 0.92, 0.02, 'lamp');
  doorMirrors(b, hwc, 1.0, 1.14, 1.35, 1.75, 0.26);
  return end;
}

/** 3.5 t Luton: van cab + box with the peak over the cab, shutter, tail lift. */
function luton(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const hwc = Math.min(hw, 1.0);
  const tyre = clamp(0.35, 0.25, H * 0.12);
  const cabTop = Math.min(2.3, H - 0.6);
  const cab = vanCab(b, hwc, cabTop);
  const floor = 0.8;
  const lift = 0.1;
  loft(
    b,
    [
      { f: 0.95, z0: cabTop + 0.08, z1: H - 0.35, hw: hw - 0.06, rt: 0.3, rb: 0.15 },
      { f: 1.28, z0: cabTop + 0.03, z1: H, hw, rt: 0.1, rb: 0.05 },
      { f: cab + 0.06, z0: cabTop + 0.03, z1: H, hw, rt: 0.1, rb: 0.05 },
      { f: cab + 0.06, z0: floor, z1: H, hw, rt: 0.1, rb: 0.03 },
      { f: L - lift, z0: floor, z1: H, hw, rt: 0.1, rb: 0.03 },
    ],
    { segs: 3, zBreaks: [floor + 0.1], paint: (q) => (q.n[2] > 0.75 ? 'pale' : isSide(q) && q.z < floor + 0.1 ? 'trim' : 'body') },
  );
  // Roller shutter, tail lift (folded), lamps, chassis.
  for (let z = floor + 0.15; z < H - 0.15; z += 0.14) endPanel(b, L - lift + 0.004, 1, -(hw - 0.1), hw - 0.1, z, z + 0.02, 'shade');
  box(b, L - lift, L, -(hw - 0.12), hw - 0.12, 0.28, floor + 0.3, 'metal');
  for (const side of [-1, 1]) {
    endPanel(b, L + 0.004, 1, side * (hw - 0.1), side * (hw - 0.02), H - 0.16, H - 0.08, 'tail');
    endPanel(b, L + 0.004, 1, side * (hw - 0.34), side * (hw - 0.14), 0.32, 0.46, 'tail');
    box(b, cab, L - lift, side * 0.45 - 0.05, side * 0.45 + 0.05, 0.42, floor, 'trim');
  }
  markers(b, hw, cab + 0.4, L - 0.6, floor + 0.02, 1.6);
  arch(b, hwc, 0.95, tyre, 0.3);
  wheels(b, { f: 0.95, r: tyre, outer: hwc - 0.06, width: 0.22 });
  wheels(b, { f: Math.min(L - 1.4, 4.9 * (L / 6.9)), r: tyre, outer: hw - 0.12, width: 0.44, dual: true });
}

/* ── Box trucks + the Bandwagon ───────────────────────────── */

/** A box behind (and over) a conventional cab: floor, attic over the cab. */
function boxBody(b: MeshBuilder, f0: number, L: number, hw: number, H: number, floor: number, cabTop: number, cabEnd: number, opts: { attic: number; windows?: (q: Face) => boolean }): void {
  const st = [
    { f: f0, z0: cabTop + 0.1, z1: H - 0.3, hw: hw - 0.06, rt: 0.28, rb: 0.12 },
    { f: f0 + 0.3, z0: cabTop + 0.05, z1: H, hw, rt: 0.1, rb: 0.05 },
    { f: cabEnd + 0.06, z0: cabTop + 0.05, z1: H, hw, rt: 0.1, rb: 0.05 },
    { f: cabEnd + 0.06, z0: floor, z1: H, hw, rt: 0.1, rb: 0.03 },
    { f: L, z0: floor, z1: H, hw, rt: 0.1, rb: 0.03 },
  ];
  loft(b, opts.attic > 0 ? st : st.slice(3), {
    segs: 3,
    zBreaks: [floor + 0.1, 1.9, 2.9],
    paint: (q) => {
      if (opts.windows?.(q)) return 'glass';
      if (q.n[2] > 0.75) return 'pale';
      return isSide(q) && q.z < floor + 0.1 ? 'trim' : 'body';
    },
  });
}

/** Rental-style 26 ft box truck: medium-duty conventional, attic over the cab. */
function boxTruckUS(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const tyre = clamp(0.5, 0.3, H * 0.13);
  const Hcab = Math.min(2.8, H - 0.7);
  const cabEnd = conventionalFront(b, W, H, { hood: 1.55, cab: 1.3, sleeper: 0, hh: 1.55, Hcab, Hs: Hcab, tyre, stacks: false, tanks: false });
  const floor = 1.05;
  boxBody(b, 1.55 + 0.55, L, hw, H, floor, Hcab, cabEnd, { attic: 1 });
  // Roll-up door slats, lamps, markers, the ramp under the floor.
  for (let z = floor + 0.15; z < H - 0.15; z += 0.16) endPanel(b, L + 0.004, 1, -(hw - 0.12), hw - 0.12, z, z + 0.025, 'shade');
  box(b, L - 2.4, L - 0.02, -0.5, 0.5, floor - 0.16, floor - 0.04, 'metal');
  for (const side of [-1, 1]) {
    endPanel(b, L + 0.004, 1, side * (hw - 0.1), side * (hw - 0.02), H - 0.16, H - 0.08, 'tail');
    endPanel(b, L + 0.004, 1, side * (hw - 0.4), side * (hw - 0.15), floor - 0.02, floor + 0.12, 'tail');
    box(b, cabEnd, L - 0.05, side * 0.45 - 0.06, side * 0.45 + 0.06, 0.7, floor, 'trim');
  }
  cylAlong(b, cabEnd + 0.1, cabEnd + 1.2, -(hw - 0.32), tyre * 1.3, 0.27, 12, 'metal');
  markers(b, hw, cabEnd + 0.5, L - 0.5, floor + 0.02, 2.2);
  const rear = L - 2.7 * (L / 10.4);
  arch(b, hw, rear, tyre, floor);
  wheels(b, { f: rear, r: tyre, outer: hw - 0.05, width: 0.6, dual: true });
}

/** The BandWagon: Freightliner M2-class front, living box over the cab,
 *  windows, side door, garage at the back. */
function bandwagon(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const tyre = clamp(0.5, 0.3, H * 0.13);
  const Hcab = Math.min(2.9, H - 0.75);
  const hood = 1.65;
  const cabEnd = conventionalFront(b, W, H, { hood, cab: 1.3, sleeper: 0, hh: 1.6, Hcab, Hs: Hcab, tyre, stacks: false, tanks: true });
  const floor = 1.0;
  const lounge = panes(cabEnd + 0.45, Math.min(L - 4.0, cabEnd + 3.4), 1.3, 0.12);
  const doorF: [number, number] = [lounge.length ? lounge[lounge.length - 1][1] + 0.3 : cabEnd + 3.6, 0];
  doorF[1] = doorF[0] + 0.75;
  const roof = H - 0.12;
  boxBody(b, hood + 0.45, L, hw, roof, floor, Hcab, cabEnd, {
    attic: 1,
    windows: (q) =>
      (isSide(q) && inZ(q, 1.9, 2.9) && inF(q, lounge)) ||
      (isSide(q) && q.s > 0 && inZ(q, 2.15, 2.9) && q.f > doorF[0] + 0.12 && q.f < doorF[1] - 0.12) ||
      (isFront(q) && q.z > Hcab + 0.3 && q.z < roof - 0.3 && q.f < hood + 1.0),
  });
  // Side door outline, roof air-con pods, rear garage ramp door, lamps.
  sidePanel(b, hw + 0.005, doorF[0], doorF[0] + 0.03, floor + 0.05, Math.min(3.05, roof - 0.2), 'trim');
  sidePanel(b, hw + 0.005, doorF[1], doorF[1] + 0.03, floor + 0.05, Math.min(3.05, roof - 0.2), 'trim');
  roundBox(b, L * 0.38, L * 0.38 + 0.95, 0, 0.42, roof - 0.02, H, 0.06, 'pale');
  roundBox(b, L * 0.72, L * 0.72 + 0.95, 0, 0.42, roof - 0.02, H, 0.06, 'pale');
  endPanel(b, L + 0.004, 1, -(hw - 0.1), hw - 0.1, floor + 0.04, floor + 0.08, 'trim');
  endPanel(b, L + 0.004, 1, -(hw - 0.1), hw - 0.1, roof - 0.34, roof - 0.3, 'trim');
  for (const side of [-1, 1]) {
    endPanel(b, L + 0.004, 1, side * (hw - 0.14), side * (hw - 0.1), floor + 0.04, roof - 0.3, 'trim');
    endPanel(b, L + 0.004, 1, side * (hw - 0.09), side * (hw - 0.02), floor - 0.02, floor + 0.6, 'tail');
    box(b, cabEnd, L - 0.05, side * 0.45 - 0.06, side * 0.45 + 0.06, 0.7, floor, 'trim');
  }
  markers(b, hw, cabEnd + 0.4, L - 0.5, floor + 0.02, 2.0);
  const rear = L - 3.0 * (L / 11.6);
  arch(b, hw, rear, tyre, floor);
  wheels(b, { f: rear, r: tyre, outer: hw - 0.05, width: 0.6, dual: true });
}

/* ── Car, generator ───────────────────────────────────────── */

/** A big estate / SUV runner. */
function car(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const tyre = clamp(0.37, 0.25, H * 0.26);
  const belt = clamp(0.95, 0.6, H * 0.64);
  const top = H - 0.1;
  const k = L / 5;
  const win: [number, number][] = [[1.98 * k, 2.95 * k], [3.07 * k, 4.05 * k], [4.17 * k, L - 0.52]];
  loft(
    b,
    [
      { f: 0, z0: 0.3, z1: 0.62, hw: hw - 0.3, rt: 0.18, rb: 0.08 },
      { f: 0.25, z0: 0.26, z1: 0.82, hw: hw - 0.08, rt: 0.22, rb: 0.08 },
      { f: 1.2 * k, z0: 0.25, z1: belt, hw: hw - 0.03, rt: 0.25, rb: 0.08 },
      { f: 1.95 * k, z0: 0.25, z1: H, hw: hw - 0.08, rt: 0.42, rb: 0.08 },
      { f: L - 0.75, z0: 0.25, z1: H - 0.02, hw: hw - 0.08, rt: 0.42, rb: 0.08 },
      { f: L - 0.1, z0: 0.28, z1: H - 0.15, hw: hw - 0.06, rt: 0.34, rb: 0.08 },
      { f: L, z0: 0.33, z1: H - 0.32, hw: hw - 0.14, rt: 0.25, rb: 0.08 },
    ],
    {
      segs: 5,
      zBreaks: [0.48, belt, top],
      fBreaks: [...edges(win), 0.4, L - 0.4],
      paint: (q) => {
        if (q.z < 0.48 && (q.f < 0.4 || q.f > L - 0.4)) return 'trim';
        if (isFront(q)) return q.f > 1.0 && q.z > belt - 0.02 ? 'glass' : 'body';
        if (isBack(q) || (q.n[0] > 0.3 && q.n[2] > 0.3)) return q.z > belt + 0.05 ? 'glass' : 'body';
        if (inZ(q, belt + 0.02, top) && inF(q, win) && Math.abs(q.n[1]) > 0.35) return 'glass';
        if (isSide(q) && q.z < 0.4) return 'trim';
        return 'body';
      },
    },
  );
  roundBox(b, 0.04, 0.2, 0, 0.42, 0.45, 0.68, 0.05, 'trim');
  for (const side of [-1, 1]) {
    roundBox(b, 0.12, 0.34, side * (hw - 0.32), 0.2, 0.66, 0.73, 0.02, 'lamp');
    endPanel(b, L + 0.004, 1, side * (hw - 0.46), side * (hw - 0.16), 0.78, 0.92, 'tail');
  }
  doorMirrors(b, hw - 0.06, 1.98 * k, 2.1 * k, belt + 0.02, belt + 0.18, 0.2);
  for (const f of [0.95 * k, L - 1.1 * k]) {
    arch(b, hw, f, tyre, 0.25);
    wheels(b, { f, r: tyre, outer: hw - 0.03, width: 0.25 });
  }
}

/** A trailer-mounted tour generator: canopy, louvres, exhaust, drawbar. */
function generator(b: MeshBuilder, L: number, W: number, H: number): void {
  const hw = W / 2;
  const bar = clamp(1.3, 0.6, L * 0.25);
  const tyre = clamp(0.38, 0.22, H * 0.16);
  const z0 = tyre * 2 - 0.12;
  const roof = H - 0.22;
  loft(b, [{ f: bar, z0, z1: roof, hw: hw - 0.04, rt: 0.05, rb: 0.02 }, { f: L, z0, z1: roof, hw: hw - 0.04, rt: 0.05, rb: 0.02 }], { segs: 2, paint: () => 'body' });
  const hs = hw - 0.04;
  const slats = (side: number, f0: number, f1: number) => {
    for (let z = z0 + 0.3; z < roof - 0.3; z += 0.11) sidePanel(b, side * (hs + 0.005), f0, f1, z, z + 0.045, 'trim');
  };
  for (const side of [-1, 1]) {
    slats(side, bar + 0.15, bar + 1.0);
    slats(side, L - 1.0, L - 0.15);
    const mid = (bar + 1.15 + L - 1.15) / 2;
    for (const [a, c] of [[bar + 1.15, mid - 0.04], [mid + 0.04, L - 1.15]] as const) {
      sidePanel(b, side * (hs + 0.005), a, a + 0.03, z0 + 0.12, roof - 0.12, 'trim');
      sidePanel(b, side * (hs + 0.005), c - 0.03, c, z0 + 0.12, roof - 0.12, 'trim');
      sidePanel(b, side * (hs + 0.007), c - 0.18, c - 0.1, (z0 + roof) / 2, (z0 + roof) / 2 + 0.05, 'metal');
    }
  }
  for (let z = z0 + 0.25; z < roof - 0.25; z += 0.11) {
    endPanel(b, bar - 0.004, -1, -(hs - 0.15), hs - 0.15, z, z + 0.045, 'trim');
    endPanel(b, L + 0.004, 1, -(hs - 0.15), hs - 0.15, z, z + 0.045, 'trim');
  }
  // Exhaust stack + rain cap, a beacon.
  cylUp(b, L - 0.9, hs - 0.45, 0.08, roof, H, 12, 'metal');
  cylUp(b, bar + 0.5, -(hs - 0.35), 0.07, roof, roof + 0.14, 10, 'amber');
  // Chassis, drawbar, jockey wheel, stabiliser legs, axles under fenders.
  box(b, bar, L, -(hs - 0.1), hs - 0.1, z0 - 0.16, z0, 'trim');
  for (const side of [-1, 1]) {
    beam(b, [0.22, 0, z0 - 0.08], [bar + 0.05, side * (hs - 0.25), z0 - 0.08], 0.09, 0.11, 'trim');
    box(b, L - 0.3, L - 0.18, side * (hs - 0.3) - 0.06, side * (hs - 0.3) + 0.06, 0, z0 - 0.16, 'trim');
    endPanel(b, L + 0.004, 1, side * (hs - 0.3), side * (hs - 0.08), z0 - 0.14, z0 - 0.03, 'tail');
  }
  box(b, 0, 0.28, -0.07, 0.07, z0 - 0.16, z0 - 0.02, 'metal');
  cylUp(b, 0.5, 0.12, 0.035, 0.08, z0 - 0.08, 8, 'trim');
  cylUp(b, 0.5, 0.12, 0.08, 0, 0.08, 10, 'tyre');
  const mid = bar + (L - bar) * 0.5;
  for (const f of [mid - 0.45, mid + 0.45]) {
    arch(b, hs, f, tyre, z0, 'metal');
    wheels(b, { f, r: tyre, outer: hs - 0.02, width: 0.22 });
  }
}

/* ── Rigs ──────────────────────────────────────────────────── */

/** Build a part on its own (f from 0) and add it `at` metres back. */
function part(b: MeshBuilder, at: number, fn: (pb: MeshBuilder) => void): void {
  const pb = new MeshBuilder();
  fn(pb);
  b.add(pb.mesh(), at);
}

/** Split a towing rig like the plan does (silhouettes.ts `towed`). */
function towSplit(L: number, trailer: number, gap: number): { hitch: number; tStart: number } {
  const tl = clamp(trailer, 1.5, L * 0.45);
  const tStart = L - tl;
  return { hitch: tStart - gap, tStart };
}

/** The 3D model of a vehicle at its true size. */
export function vehicleMesh(v: { type: VehicleType | string; length: number; width: number; height: number }): Mesh {
  const L = v.length;
  const W = v.width;
  const H = v.height;
  const b = new MeshBuilder();
  const spec = vehicleSpec(v.type);
  const rig = (front: (pb: MeshBuilder, len: number) => void, trailerH: number, us: boolean, fallback: { length: number; gap: number }) => {
    const t = spec?.trailer ?? fallback;
    const { hitch, tStart } = towSplit(L, t.length, t.gap);
    part(b, 0, (pb) => front(pb, hitch));
    part(b, hitch, (pb) => smallTrailer(pb, L - hitch, W * 0.98, trailerH, tStart - hitch, us));
  };
  switch (v.type) {
    case 'bus_eu':
      coachEU(b, L, W, H);
      break;
    case 'bus_eu_trailer':
      rig((pb, len) => coachEU(pb, len, W, H), Math.min(H, 2.9), false, { length: 4.3, gap: 1.0 });
      break;
    case 'bus_us':
      coachUS(b, L, W, H);
      break;
    case 'bus_us_trailer':
      rig((pb, len) => coachUS(pb, len, W, H), Math.min(H, 2.9), true, { length: 4.3, gap: 1.0 });
      break;
    case 'bandwagon':
      bandwagon(b, L, W, H);
      break;
    case 'bandwagon_trailer':
      rig((pb, len) => bandwagon(pb, len, W, H), Math.min(H, 2.9), true, { length: 5.5, gap: 0.9 });
      break;
    case 'splitter':
      rig((pb, len) => sprinter(pb, len, W, H, true), Math.min(H, 2.25), false, { length: L * 0.4, gap: 1.0 });
      break;
    case 'sprinter':
      sprinter(b, L, W, H, true);
      break;
    case 'vito':
      vito(b, L, W, H);
      break;
    case 'luton':
      luton(b, L, W, H);
      break;
    case 'box_us':
      boxTruckUS(b, L, W, H);
      break;
    case 'tractor_eu':
      cabOverTractor(b, L, W, H);
      break;
    case 'tractor_us':
      usTractor(b, L, W, H);
      break;
    case 'trailer_eu':
      semiTrailer(b, L, W, H, false);
      break;
    case 'trailer_us':
      semiTrailer(b, L, W, H, true);
      break;
    case 'truck_eu': {
      const tStart = Math.max(clamp(2.3, 1.6, L * 0.45) + 0.45, L - 13.6);
      part(b, 0, (pb) => cabOverTractor(pb, Math.min(6.0, L), W, Math.min(H, 3.95)));
      part(b, tStart, (pb) => semiTrailer(pb, L - tStart, W, H, false));
      break;
    }
    case 'truck_us': {
      const tStart = Math.max(6.2, L - 16.15);
      part(b, 0, (pb) => usTractor(pb, Math.min(8.3, tStart + 1.6), W, Math.min(H, 4.05)));
      part(b, tStart, (pb) => semiTrailer(pb, L - tStart, W, H, true));
      break;
    }
    case 'car':
      car(b, L, W, H);
      break;
    case 'generator':
      generator(b, L, W, H);
      break;
    default:
      // An unknown type still gets a true-size box, never nothing.
      loft(b, [{ f: 0, z0: 0.3, z1: H, hw: W / 2, rt: 0.1 }, { f: L, z0: 0.3, z1: H, hw: W / 2, rt: 0.1 }], { segs: 2, paint: () => 'body' });
  }
  return b.mesh();
}

/** The mesh in metres east / north / up of the vehicle's centre on the
 *  ground, for a vehicle at `heading` (what scene3d uploads). */
export function meshToLocal(pos: readonly number[], v: { length: number; heading: number }): Float64Array {
  const h = (v.heading * Math.PI) / 180;
  const fwd = { x: Math.sin(h), y: Math.cos(h) };
  const right = { x: fwd.y, y: -fwd.x };
  const n = pos.length / 3;
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const along = v.length / 2 - pos[i * 3];
    const s = pos[i * 3 + 1];
    out[i * 3] = fwd.x * along + right.x * s;
    out[i * 3 + 1] = fwd.y * along + right.y * s;
    out[i * 3 + 2] = pos[i * 3 + 2];
  }
  return out;
}
