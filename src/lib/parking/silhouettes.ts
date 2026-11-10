/* ============================================
   LOWPASS — Parking maps: what each vehicle looks like from above (Nov 2026)

   Adam: "should look a little more like a bus with trailer and a semi or a UK
   truck … depending on the vic, there should be a decent model".

   A vehicle is drawn as PARTS along its length, each a rectangle in metres:
   `f0`–`f1` measured back from the nose, `w` its width (centred), `kind` how
   it is painted, `h` its height as a share of the vehicle's height (the 3D
   page extrudes the same parts, so the plan and the model can't disagree).

   Cabs, hoods and drawbars keep their real-world lengths; the body or trailer
   takes whatever is left, so a vehicle typed longer or shorter stretches where
   a real one would. Everything stays inside the vehicle's length × width
   except mirrors, which stick out as they do.
   ============================================ */

import { vehicleSpec, type VehicleType } from './catalogue';

export type PartKind = 'body' | 'cab' | 'hood' | 'glass' | 'roof' | 'coupling' | 'mirror' | 'rib';

export interface Part {
  kind: PartKind;
  /** Distance back from the nose, metres. */
  f0: number;
  f1: number;
  /** Width, metres, centred on the vehicle's axis. */
  w: number;
  /** Height as a share of the vehicle's height (3D). */
  h: number;
  /** Corner rounding, metres. */
  r?: number;
  /** Offset across the axis (mirrors), metres; + = right. */
  s?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function coach(f0: number, L: number, W: number): Part[] {
  const len = L - f0;
  const out: Part[] = [
    { kind: 'body', f0, f1: L, w: W, h: 1, r: 0.45 },
    { kind: 'glass', f0: f0 + 0.12, f1: f0 + 0.75, w: W * 0.86, h: 0.98, r: 0.3 },
    { kind: 'mirror', f0: f0 + 0.35, f1: f0 + 0.6, w: 0.22, h: 0.7, s: -(W / 2 + 0.2) },
    { kind: 'mirror', f0: f0 + 0.35, f1: f0 + 0.6, w: 0.22, h: 0.7, s: W / 2 + 0.2 },
  ];
  // Roof units (air-con / hatches), only if there's room for them.
  if (len > 8) {
    out.push({ kind: 'roof', f0: f0 + len * 0.22, f1: f0 + len * 0.22 + 1.8, w: W * 0.6, h: 1.04, r: 0.2 });
    out.push({ kind: 'roof', f0: f0 + len * 0.62, f1: f0 + len * 0.62 + 1.8, w: W * 0.6, h: 1.04, r: 0.2 });
  }
  return out;
}

function boxTrailer(f0: number, f1: number, W: number, ribs: boolean): Part[] {
  const out: Part[] = [{ kind: 'body', f0, f1, w: W, h: 1, r: 0.15 }];
  if (ribs) {
    const n = Math.floor((f1 - f0) / 3);
    for (let i = 1; i < n; i++) {
      const at = f0 + ((f1 - f0) * i) / n;
      out.push({ kind: 'rib', f0: at - 0.04, f1: at + 0.04, w: W * 0.92, h: 1.01 });
    }
  }
  return out;
}

function towed(L: number, W: number, trailerLen: number, gap: number, front: (end: number) => Part[]): Part[] {
  const tl = clamp(trailerLen, 1.5, L * 0.45);
  const tStart = L - tl;
  const hitch = tStart - gap;
  return [
    ...front(hitch),
    { kind: 'coupling', f0: hitch - 0.2, f1: tStart + 0.2, w: 0.18, h: 0.25 },
    ...boxTrailer(tStart, L, W * 0.92, false),
  ];
}

/** The parts of a vehicle of this type at this size. */
export function vehicleParts(type: VehicleType | string, L: number, W: number): Part[] {
  const spec = vehicleSpec(type);
  switch (type) {
    case 'bus_eu':
    case 'bus_us':
      return coach(0, L, W);
    case 'bus_eu_trailer':
    case 'bus_us_trailer': {
      const t = spec?.trailer ?? { length: 4.3, gap: 1 };
      return towed(L, W, t.length, t.gap, (end) => coach(0, end, W).map((p) => ({ ...p, f1: Math.min(p.f1, end) })).filter((p) => p.f1 > p.f0));
    }
    case 'truck_eu': {
      // Cab-over tractor, a short run of chassis, then the box trailer.
      const cab = clamp(2.3, 1.5, L * 0.3);
      return [
        { kind: 'cab', f0: 0, f1: cab, w: W, h: 0.95, r: 0.25 },
        { kind: 'glass', f0: 0.1, f1: 0.55, w: W * 0.86, h: 0.9, r: 0.15 },
        { kind: 'mirror', f0: 0.3, f1: 0.55, w: 0.22, h: 0.7, s: -(W / 2 + 0.2) },
        { kind: 'mirror', f0: 0.3, f1: 0.55, w: 0.22, h: 0.7, s: W / 2 + 0.2 },
        { kind: 'coupling', f0: cab, f1: cab + 0.8, w: W * 0.55, h: 0.3 },
        ...boxTrailer(cab + 0.8, L, W, true),
      ];
    }
    case 'truck_us': {
      // Conventional: long hood, cab, sleeper, then the 53 ft trailer.
      const hood = 2.3;
      const cab = 1.9;
      const sleeper = 1.9;
      const tStart = hood + cab + sleeper + 0.7;
      return [
        { kind: 'hood', f0: 0, f1: hood, w: W * 0.82, h: 0.5, r: 0.35 },
        { kind: 'cab', f0: hood, f1: hood + cab, w: W, h: 0.85, r: 0.2 },
        { kind: 'glass', f0: hood + 0.05, f1: hood + 0.55, w: W * 0.84, h: 0.8, r: 0.12 },
        { kind: 'mirror', f0: hood + 0.15, f1: hood + 0.4, w: 0.22, h: 0.65, s: -(W / 2 + 0.25) },
        { kind: 'mirror', f0: hood + 0.15, f1: hood + 0.4, w: 0.22, h: 0.65, s: W / 2 + 0.25 },
        { kind: 'cab', f0: hood + cab, f1: hood + cab + sleeper, w: W, h: 0.92, r: 0.2 },
        { kind: 'coupling', f0: hood + cab + sleeper, f1: tStart, w: W * 0.55, h: 0.3 },
        ...boxTrailer(Math.min(tStart, L - 2), L, W, true),
      ];
    }
    case 'splitter':
      return towed(L, W, L * 0.4, 1.0, (end) => [
        { kind: 'hood', f0: 0, f1: 0.7, w: W * 0.9, h: 0.45, r: 0.35 },
        { kind: 'body', f0: 0.6, f1: end, w: W, h: 1, r: 0.3 },
        { kind: 'glass', f0: 0.7, f1: 1.2, w: W * 0.86, h: 0.9, r: 0.2 },
        { kind: 'mirror', f0: 0.9, f1: 1.1, w: 0.2, h: 0.6, s: -(W / 2 + 0.15) },
        { kind: 'mirror', f0: 0.9, f1: 1.1, w: 0.2, h: 0.6, s: W / 2 + 0.15 },
      ]);
    case 'car':
      return [
        { kind: 'body', f0: 0, f1: L, w: W, h: 1, r: 0.6 },
        { kind: 'glass', f0: L * 0.27, f1: L * 0.37, w: W * 0.8, h: 0.95, r: 0.2 },
        { kind: 'roof', f0: L * 0.37, f1: L * 0.72, w: W * 0.78, h: 1, r: 0.25 },
        { kind: 'glass', f0: L * 0.72, f1: L * 0.8, w: W * 0.76, h: 0.9, r: 0.2 },
      ];
    case 'generator':
      return [
        { kind: 'coupling', f0: 0, f1: Math.min(1, L * 0.2), w: 0.18, h: 0.2 },
        ...boxTrailer(Math.min(1, L * 0.2), L, W, true),
      ];
    default:
      return [{ kind: 'body', f0: 0, f1: L, w: W, h: 1, r: 0.3 }];
  }
}
