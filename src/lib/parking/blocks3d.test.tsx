/* Parking maps — the 3D page's vehicles are the plan's vehicles, at true height. */

import { describe, expect, it } from 'vitest';
import { standingHeight, vehicleBlocks } from './blocks3d';
import { VEHICLES } from './catalogue';
import { vehicleParts } from './silhouettes';
import { vehicleCorners, parseView, ParkingInputError } from './model';

const bus = { type: 'bus_eu_trailer', x: 10, y: -4, heading: 62, length: 18.75, width: 2.55, height: 4 } as const;

describe('vehicleBlocks', () => {
  it('every catalogue vehicle becomes blocks that stand on the ground and reach its height', () => {
    for (const s of VEHICLES) {
      const blocks = vehicleBlocks({ type: s.type, x: 0, y: 0, heading: 0, length: s.length, width: s.width, height: s.height });
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b.z0).toBeGreaterThanOrEqual(0);
        expect(b.z1).toBeGreaterThan(b.z0);
        expect(b.z1).toBeLessThanOrEqual(s.height * 1.1 + 0.2);
      }
      const solid = blocks.filter((b) => b.kind === 'body' || b.kind === 'cab' || b.kind === 'cabin');
      expect(Math.max(...solid.map((b) => b.z1))).toBeGreaterThan(s.height * 0.9);
    }
  });

  it('the blocks sit inside the overhead footprint (mirrors aside), at any heading', () => {
    for (const heading of [0, 62, 181, 300]) {
      const v = { ...bus, heading };
      const [fl, , , rl] = vehicleCorners(v);
      const fwd = { x: Math.sin((heading * Math.PI) / 180), y: Math.cos((heading * Math.PI) / 180) };
      for (const b of vehicleBlocks(v)) {
        if (b.kind === 'mirror' || b.kind === 'glass') continue;
        // Along the axis, the block's centre lies between the rear and the nose.
        const along = (b.at.x - v.x) * fwd.x + (b.at.y - v.y) * fwd.y;
        expect(Math.abs(along) + b.length / 2).toBeLessThanOrEqual(v.length / 2 + 0.25);
        expect(b.heading).toBe(heading);
      }
      expect(Math.hypot(fl.x - rl.x, fl.y - rl.y)).toBeCloseTo(18.75);
    }
  });

  it('a bus + trailer is two bodies with a drawbar between, the trailer at the back', () => {
    const blocks = vehicleBlocks({ ...bus, heading: 0, x: 0, y: 0 });
    const bodies = blocks.filter((b) => b.kind === 'body');
    expect(bodies).toHaveLength(2);
    const [coach, trailer] = bodies;
    expect(coach.at.y).toBeGreaterThan(trailer.at.y); // heading 0: the coach is north of its trailer
    expect(trailer.at.y - trailer.length / 2).toBeCloseTo(-18.75 / 2, 1);
    expect(blocks.some((b) => b.kind === 'coupling')).toBe(true);
  });

  it('the windscreen stands just proud of the front face', () => {
    const blocks = vehicleBlocks({ type: 'bus_eu', x: 0, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4 });
    const glass = blocks.find((b) => b.kind === 'glass')!;
    expect(glass.at.y + glass.length / 2).toBeGreaterThan(13.5 / 2);
    expect(glass.at.y - glass.length / 2).toBeLessThan(13.5 / 2);
  });
});

describe('the saved 3D camera', () => {
  const view = { cx: 0, cy: 0, ppm: 2, rotation: 0 };
  it('round-trips through the server gate, normalised', () => {
    const v = parseView({ ...view, cam3d: { x: -80, y: -120, alt: 210.5, heading: 380, pitch: -35, roll: 0, junk: 1 } });
    expect(v.cam3d).toEqual({ x: -80, y: -120, alt: 210.5, heading: 20, pitch: -35, roll: 0 });
    expect(parseView(view).cam3d).toBeUndefined();
  });

  it('refuses nonsense', () => {
    for (const cam3d of [{ x: 0, y: 0, alt: 1e6, heading: 0, pitch: 0, roll: 0 }, { x: 0, y: 0, alt: 10, heading: 0, pitch: -120, roll: 0 }, 'up there']) {
      expect(() => parseView({ ...view, cam3d })).toThrow(ParkingInputError);
    }
  });
});

describe('standingHeight — never on the roof', () => {
  it('a bus on open ground stands on the lowest point under it (a tree does not lift it)', () => {
    expect(standingHeight([5, 5.1, 9, 5.2, 5], [5, 4.9, 5.1, 5, 5, 5, 5, 5], 0)).toBe(5);
  });
  it('a kerb or ramp is not a roof', () => {
    expect(standingHeight([6.5, 6.6, 6.5, 6.7, 6.5], [5, 5, 6, 6, 7, 7, 6, 5], 0)).toBe(6.5);
  });
  it('under a canopy every point says "roof" — stand on the ground round it', () => {
    expect(standingHeight([22, 22.4, 21.8, 22, 22.1], [5, 22, 22, 5.2, 21, 5.1, 22, 22], 0)).toBe(5);
  });
  it('no samples → the fallback', () => {
    expect(standingHeight([], [], 3)).toBe(3);
  });
});

describe('a car looks like a car in 3D (Nov 2026)', () => {
  const car = { type: 'car', x: 0, y: 0, heading: 0, length: 5, width: 2, height: 1.5 } as const;
  const blocks = vehicleBlocks(car);
  it('four wheels on the ground, a low body, a cabin on top — not one brick', () => {
    const wheels = blocks.filter((b) => b.kind === 'wheel');
    expect(wheels).toHaveLength(4);
    for (const w of wheels) expect(w.z0).toBe(0);
    const body = blocks.find((b) => b.kind === 'body')!;
    const cabin = blocks.find((b) => b.kind === 'cabin')!;
    expect(body.z1).toBeLessThan(0.9);
    expect(cabin.z0).toBeLessThanOrEqual(body.z1);
    expect(cabin.z1).toBeCloseTo(1.5);
    expect(cabin.length).toBeLessThan(body.length * 0.6);
    expect(cabin.width).toBeLessThan(body.width);
  });
  it('nothing sticks out past the car but its mirrors', () => {
    for (const b of blocks.filter((x) => x.kind !== 'mirror')) {
      expect(Math.abs(b.at.y) + b.length / 2).toBeLessThanOrEqual(2.5 + 0.2);
    }
  });
});

describe('nothing floats (Adam, Nov 2026: "something floating above the cab only")', () => {
  it('a roof unit only ever sits on top of a body, cab or cabin part', () => {
    for (const v of VEHICLES) {
      const parts = vehicleParts(v.type, v.length, v.width);
      const under = parts.filter((p) => p.kind === 'body' || p.kind === 'cab' || p.kind === 'cabin');
      for (const r of parts.filter((p) => p.kind === 'roof')) {
        const mid = (r.f0 + r.f1) / 2;
        expect(under.some((u) => u.f0 <= mid && mid <= u.f1), `${v.type}: roof unit over nothing`).toBe(true);
      }
    }
  });
  it("a tractor's fifth wheel sits at coupling height (47 in ≈ 1.2 m), on its chassis, over tyres", () => {
    for (const t of ['tractor_eu', 'tractor_us'] as const) {
      const s = VEHICLES.find((v) => v.type === t)!;
      const blocks = vehicleBlocks({ type: t, x: 0, y: 0, heading: 0, length: s.length, width: s.width, height: s.height });
      const plate = blocks.find((b) => b.kind === 'plate')!;
      const chassis = blocks.find((b) => b.kind === 'coupling')!;
      expect(plate.z1).toBeGreaterThan(1.0);
      expect(plate.z1).toBeLessThan(1.4);
      expect(plate.z0).toBeLessThanOrEqual(chassis.z1 + 0.01);
      expect(blocks.filter((b) => b.kind === 'wheel').length).toBeGreaterThanOrEqual(4);
    }
  });
});
