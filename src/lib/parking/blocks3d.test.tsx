/* Parking maps — the 3D page's vehicles are the plan's vehicles, at true height. */

import { describe, expect, it } from 'vitest';
import { vehicleBlocks } from './blocks3d';
import { VEHICLES } from './catalogue';
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
      const solid = blocks.filter((b) => b.kind === 'body' || b.kind === 'cab');
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
