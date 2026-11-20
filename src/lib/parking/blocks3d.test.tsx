/* Parking maps — the 3D page's vehicles are the plan's vehicles, at true height. */

import { describe, expect, it } from 'vitest';
import { standingHeight } from './blocks3d';
import { VEHICLES } from './catalogue';
import { vehicleParts } from './silhouettes';
import { parseView, ParkingInputError } from './model';


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
});
