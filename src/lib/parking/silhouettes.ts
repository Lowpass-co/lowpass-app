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

/** `cabin`: a car's passenger compartment, sitting ON the lower body (3D);
 *  `wheel`: under the body — hidden on the plan, the tyres in 3D.
 *  `plate`: a tractor's fifth wheel — on the chassis, at coupling height (47 in). */
export type PartKind = 'body' | 'cab' | 'hood' | 'glass' | 'roof' | 'coupling' | 'mirror' | 'rib' | 'cabin' | 'wheel' | 'plate';

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

/** Tyre pairs (both sides) at these distances from the nose — 1 m truck tyres. */
function tyres(axles: number[], W: number): Part[] {
  return axles.flatMap((at) => [-1, 1].map((side): Part => ({ kind: 'wheel', f0: at - 0.5, f1: at + 0.5, w: 0.3, h: 0.26, s: side * (W / 2 - 0.2) })));
}

/** A cab-over truck cab, nose at 0, `len` long (EU tractors, UK box lorries). */
function cabOver(len: number, W: number): Part[] {
  return [
    { kind: 'cab', f0: 0, f1: len, w: W, h: 0.95, r: 0.25 },
    { kind: 'glass', f0: 0.1, f1: 0.55, w: W * 0.86, h: 0.9, r: 0.15 },
    { kind: 'mirror', f0: 0.3, f1: 0.55, w: 0.22, h: 0.7, s: -(W / 2 + 0.2) },
    { kind: 'mirror', f0: 0.3, f1: 0.55, w: 0.22, h: 0.7, s: W / 2 + 0.2 },
  ];
}

/** A US conventional front — hood, then cab (and sleeper) — nose at 0. Returns
 *  the parts and where the cab ends. */
function conventional(W: number, hood: number, cab: number): { parts: Part[]; end: number } {
  return {
    end: hood + cab,
    parts: [
      { kind: 'hood', f0: 0, f1: hood, w: W * 0.82, h: 0.5, r: 0.35 },
      { kind: 'cab', f0: hood, f1: hood + cab, w: W, h: 0.85, r: 0.2 },
      { kind: 'glass', f0: hood + 0.05, f1: hood + 0.55, w: W * 0.84, h: 0.8, r: 0.12 },
      { kind: 'mirror', f0: hood + 0.15, f1: hood + 0.4, w: 0.22, h: 0.65, s: -(W / 2 + 0.25) },
      { kind: 'mirror', f0: hood + 0.15, f1: hood + 0.4, w: 0.22, h: 0.65, s: W / 2 + 0.25 },
    ],
  };
}

/** The Bandwagon / Pullman: a Freightliner hood and sleeper cab, then the
 *  full-height living box to `end`. */
function bandwagonParts(end: number, W: number): Part[] {
  const front = conventional(W, 2.0, 2.4);
  const box0 = Math.min(front.end + 0.1, end - 1);
  const len = end - box0;
  return [
    ...front.parts,
    { kind: 'body', f0: box0, f1: end, w: W, h: 1, r: 0.3 },
    ...(len > 4 ? [{ kind: 'roof' as const, f0: box0 + len * 0.3, f1: box0 + len * 0.3 + 1.6, w: W * 0.6, h: 1.04, r: 0.2 }] : []),
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
    case 'tractor_eu': {
      // Cab-over, then the bare chassis with the fifth wheel — no trailer.
      // 4×2: front axle under the cab, drive axle under the plate.
      const cab = clamp(2.3, 1.5, L * 0.5);
      const drive = Math.max(cab + 0.8, L - 0.95);
      const plate = Math.max(cab + 0.3, drive - 0.8);
      return [
        ...tyres([clamp(1.4, 0.6, cab - 0.3), drive], W),
        { kind: 'coupling', f0: cab, f1: L, w: W * 0.55, h: 0.27 },
        { kind: 'plate', f0: plate, f1: Math.min(L, plate + 1.2), w: W * 0.7, h: 0.31, r: 0.5 },
        ...cabOver(cab, W),
      ];
    }
    case 'tractor_us': {
      // Conventional sleeper (Cascadia class), 6×4: hood, cab, sleeper, chassis,
      // tandem drive axles under the fifth wheel.
      const front = conventional(W, 2.3, 1.9);
      const sleeperEnd = Math.min(L - 1.5, front.end + 1.9);
      const rear = Math.max(sleeperEnd + 0.8, L - 1.15);
      const plate = Math.max(sleeperEnd + 0.2, rear - 1.3);
      return [
        ...tyres([1.0, rear - 1.32, rear], W),
        { kind: 'coupling', f0: sleeperEnd, f1: L, w: W * 0.55, h: 0.27 },
        { kind: 'plate', f0: plate, f1: Math.min(L, plate + 1.2), w: W * 0.7, h: 0.31, r: 0.5 },
        ...front.parts,
        { kind: 'cab', f0: front.end, f1: sleeperEnd, w: W, h: 0.92, r: 0.2 },
      ];
    }
    case 'trailer_eu':
    case 'trailer_us':
      // The box on its own; a short kingpin stub where the tractor couples.
      return [
        { kind: 'coupling', f0: 0, f1: Math.min(0.6, L * 0.1), w: 0.3, h: 0.3 },
        ...boxTrailer(Math.min(0.15, L * 0.05), L, W, true),
      ];
    case 'luton': {
      // Van front (short bonnet + cab), the box running forward OVER the cab
      // roof — the Luton peak — so from above the box starts at the windscreen.
      const hood = clamp(0.7, 0.4, L * 0.12);
      return [
        { kind: 'hood', f0: 0, f1: hood, w: W * 0.9, h: 0.45, r: 0.4 },
        { kind: 'cab', f0: hood - 0.05, f1: hood + 0.9, w: W * 0.92, h: 0.75, r: 0.3 },
        { kind: 'glass', f0: hood, f1: hood + 0.4, w: W * 0.8, h: 0.78, r: 0.15 },
        { kind: 'mirror', f0: hood + 0.1, f1: hood + 0.3, w: 0.18, h: 0.6, s: -(W / 2 + 0.12) },
        { kind: 'mirror', f0: hood + 0.1, f1: hood + 0.3, w: 0.18, h: 0.6, s: W / 2 + 0.12 },
        ...boxTrailer(hood + 0.45, L, W, true),
      ];
    }
    case 'box_us': {
      // Medium-duty conventional (short hood), then the 26 ft box.
      const front = conventional(W, 1.5, 1.8);
      return [...front.parts, ...boxTrailer(Math.min(front.end + 0.15, L - 1), L, W, true)];
    }
    case 'bandwagon':
      return bandwagonParts(L, W);
    case 'bandwagon_trailer': {
      const t = spec?.trailer ?? { length: 5.5, gap: 0.9 };
      return towed(L, W, t.length, t.gap, (end) => bandwagonParts(end, W));
    }
    case 'vito':
      // A people-carrier: a longer bonnet than a Sprinter, one body to the tail.
      return [
        { kind: 'hood', f0: 0, f1: 1.0, w: W * 0.92, h: 0.5, r: 0.4 },
        { kind: 'body', f0: 0.9, f1: L, w: W, h: 1, r: 0.35 },
        { kind: 'glass', f0: 1.0, f1: 1.55, w: W * 0.86, h: 0.92, r: 0.2 },
        { kind: 'mirror', f0: 1.15, f1: 1.35, w: 0.18, h: 0.62, s: -(W / 2 + 0.12) },
        { kind: 'mirror', f0: 1.15, f1: 1.35, w: 0.18, h: 0.62, s: W / 2 + 0.12 },
      ];
    case 'splitter':
      return towed(L, W, L * 0.4, 1.0, (end) => [
        { kind: 'hood', f0: 0, f1: 0.7, w: W * 0.9, h: 0.45, r: 0.35 },
        { kind: 'body', f0: 0.6, f1: end, w: W, h: 1, r: 0.3 },
        { kind: 'glass', f0: 0.7, f1: 1.2, w: W * 0.86, h: 0.9, r: 0.2 },
        { kind: 'mirror', f0: 0.9, f1: 1.1, w: 0.2, h: 0.6, s: -(W / 2 + 0.15) },
        { kind: 'mirror', f0: 0.9, f1: 1.1, w: 0.2, h: 0.6, s: W / 2 + 0.15 },
      ]);
    case 'sprinter':
      // The splitter's van on its own: short hood, one body to the tail.
      return [
        { kind: 'hood', f0: 0, f1: 0.7, w: W * 0.9, h: 0.45, r: 0.35 },
        { kind: 'body', f0: 0.6, f1: L, w: W, h: 1, r: 0.3 },
        { kind: 'glass', f0: 0.7, f1: 1.2, w: W * 0.86, h: 0.9, r: 0.2 },
        { kind: 'mirror', f0: 0.9, f1: 1.1, w: 0.2, h: 0.6, s: -(W / 2 + 0.15) },
        { kind: 'mirror', f0: 0.9, f1: 1.1, w: 0.2, h: 0.6, s: W / 2 + 0.15 },
      ];
    case 'car': {
      // Nov 2026 (Adam: "more like cars, less like bricks"): wheels, a low
      // body (bonnet + boot) and a narrower cabin on top — not one box.
      const tyre = Math.min(0.68, L * 0.14);
      const wheel = (at: number, side: number): Part => ({ kind: 'wheel', f0: at - tyre / 2, f1: at + tyre / 2, w: 0.24, h: 0.44, s: side * (W / 2 - 0.15) });
      const cab0 = L * 0.3;
      const cab1 = L * 0.8;
      return [
        wheel(L * 0.18, -1),
        wheel(L * 0.18, 1),
        wheel(L * 0.8, -1),
        wheel(L * 0.8, 1),
        { kind: 'body', f0: 0, f1: L, w: W, h: 0.52, r: 0.6 },
        { kind: 'cabin', f0: cab0, f1: cab1, w: W * 0.84, h: 1, r: 0.3 },
        // Windscreen (front face of the cabin) and the rear window.
        { kind: 'glass', f0: cab0, f1: cab0 + L * 0.09, w: W * 0.8, h: 0.95, r: 0.2 },
        { kind: 'glass', f0: cab1 + 0.16, f1: cab1 + 0.16 + L * 0.06, w: W * 0.76, h: 0.9, r: 0.2 },
        { kind: 'mirror', f0: cab0 + 0.05, f1: cab0 + 0.25, w: 0.18, h: 0.62, s: -(W / 2 + 0.1) },
        { kind: 'mirror', f0: cab0 + 0.05, f1: cab0 + 0.25, w: 0.18, h: 0.62, s: W / 2 + 0.1 },
      ];
    }
    case 'generator':
      return [
        { kind: 'coupling', f0: 0, f1: Math.min(1, L * 0.2), w: 0.18, h: 0.2 },
        ...boxTrailer(Math.min(1, L * 0.2), L, W, true),
      ];
    default:
      return [{ kind: 'body', f0: 0, f1: L, w: W, h: 1, r: 0.3 }];
  }
}
