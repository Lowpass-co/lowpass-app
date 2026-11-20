/**
 * The 3D vehicles (Nov 2026, Adam: "recognisable at a glance") — and still
 * TRUE SIZE: every model fills its vehicle's length and height exactly, sits
 * on its tyres, and nothing hangs in the air.
 */
import { describe, expect, it } from 'vitest';
import { VEHICLES } from './catalogue';
import { bakeColours, bounds, MeshBuilder, loft, normalOf, type V3 } from './mesh3d';
import { FIFTH_WHEEL_M, vehicleMesh } from './models3d';

import { vehicleCorners } from './model';
import { meshToLocal } from './models3d';

const MIRROR_REACH = 0.45; // mirrors may stand out past the body's width

describe('every vehicle is true size', () => {
  for (const v of VEHICLES) {
    it(`${v.type}: fills ${v.length} × ${v.width} × ${v.height} m and stands on its tyres`, () => {
      const m = vehicleMesh(v);
      const [f0, f1, s0, s1, z0, z1] = bounds(m);
      expect(f0).toBeGreaterThanOrEqual(-0.02);
      expect(f1).toBeLessThanOrEqual(v.length + 0.02);
      expect(f1 - f0).toBeGreaterThan(v.length - 0.1);
      expect(z0).toBeGreaterThanOrEqual(-1e-6);
      expect(z0).toBeLessThan(0.01); // tyres on the ground
      expect(z1).toBeLessThanOrEqual(v.height + 1e-6);
      expect(z1).toBeGreaterThan(v.height - 0.08); // reaches its height
      expect(-s0).toBeLessThanOrEqual(v.width / 2 + MIRROR_REACH);
      expect(s1).toBeLessThanOrEqual(v.width / 2 + MIRROR_REACH);
      expect(m.pos.every(Number.isFinite)).toBe(true);
      expect(m.mat.length * 9).toBe(m.pos.length);
    });
  }

  it('stays sane when resized (0.7× to 1.3×)', () => {
    for (const v of VEHICLES) {
      for (const k of [0.7, 1.3]) {
        const w = { ...v, length: v.length * k, width: v.width * Math.min(k, 1.15), height: v.height * Math.min(k, 1.2) };
        const m = vehicleMesh(w);
        const [f0, f1, , , z0, z1] = bounds(m);
        expect(m.pos.every(Number.isFinite), `${v.type} ×${k}`).toBe(true);
        expect(f0, `${v.type} ×${k}`).toBeGreaterThanOrEqual(-0.02);
        expect(f1, `${v.type} ×${k}`).toBeLessThanOrEqual(w.length + 0.02);
        expect(z0, `${v.type} ×${k}`).toBeGreaterThanOrEqual(-1e-6);
        expect(z1, `${v.type} ×${k}`).toBeLessThanOrEqual(w.height + 1e-6);
      }
    }
  });
});

describe('recognisable parts', () => {
  const mats = (type: string) => new Set(vehicleMesh(VEHICLES.find((v) => v.type === type)!).mat);
  it('every vehicle has tyres; everything with a driver has glass and lamps', () => {
    for (const v of VEHICLES) {
      const m = mats(v.type);
      expect(m.has('tyre'), v.type).toBe(true);
      if (!['trailer_eu', 'trailer_us', 'generator'].includes(v.type)) {
        expect(m.has('glass'), v.type).toBe(true);
        expect(m.has('lamp'), v.type).toBe(true);
      }
    }
  });
  it('a polygon budget that stays light for a busy map', () => {
    for (const v of VEHICLES) {
      const n = vehicleMesh(v).mat.length;
      expect(n, v.type).toBeGreaterThan(300);
      expect(n, v.type).toBeLessThan(14000);
    }
  });
});

describe('nothing floats (Adam: "something floating above the cab only")', () => {
  it('behind the EU cab, nothing stands above the fifth wheel', () => {
    const v = VEHICLES.find((x) => x.type === 'tractor_eu')!;
    const m = vehicleMesh(v);
    for (let t = 0; t < m.mat.length; t++) {
      const fs = [m.pos[t * 9], m.pos[t * 9 + 3], m.pos[t * 9 + 6]];
      const zs = [m.pos[t * 9 + 2], m.pos[t * 9 + 5], m.pos[t * 9 + 8]];
      if (Math.min(...fs) > 2.45) expect(Math.max(...zs)).toBeLessThanOrEqual(FIFTH_WHEEL_M + 0.01);
    }
  });
  it("a trailer's floor sits on the fifth wheel (1.2 m), within a few cm", () => {
    for (const type of ['truck_eu', 'truck_us']) {
      const v = VEHICLES.find((x) => x.type === type)!;
      const m = vehicleMesh(v);
      // The lowest box face (its floor) is the shade-free body bottom.
      let floor = Infinity;
      for (let t = 0; t < m.mat.length; t++) {
        if (m.mat[t] !== 'body') continue;
        const zs = [m.pos[t * 9 + 2], m.pos[t * 9 + 5], m.pos[t * 9 + 8]];
        const fs = [m.pos[t * 9], m.pos[t * 9 + 3], m.pos[t * 9 + 6]];
        if (Math.min(...fs) > 8) floor = Math.min(floor, ...zs);
      }
      expect(floor - FIFTH_WHEEL_M, type).toBeGreaterThanOrEqual(0);
      expect(floor - FIFTH_WHEEL_M, type).toBeLessThan(0.08);
    }
  });
});

describe('the kit', () => {
  it('faces point outward on a lofted hull (normals agree with their position)', () => {
    const b = new MeshBuilder();
    loft(b, [{ f: 0, z0: 0, z1: 2, hw: 1, rt: 0.3, rb: 0.1 }, { f: 4, z0: 0, z1: 2, hw: 1, rt: 0.3, rb: 0.1 }], { paint: () => 'body' });
    const m = b.mesh();
    for (let t = 0; t < m.mat.length; t++) {
      const a: V3 = [m.pos[t * 9], m.pos[t * 9 + 1], m.pos[t * 9 + 2]];
      const bb: V3 = [m.pos[t * 9 + 3], m.pos[t * 9 + 4], m.pos[t * 9 + 5]];
      const c: V3 = [m.pos[t * 9 + 6], m.pos[t * 9 + 7], m.pos[t * 9 + 8]];
      const n = normalOf(a, bb, c);
      const cen: V3 = [(a[0] + bb[0] + c[0]) / 3 - 2, (a[1] + bb[1] + c[1]) / 3, (a[2] + bb[2] + c[2]) / 3 - 1];
      expect(n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2]).toBeGreaterThan(0);
    }
  });
  it('bakes one colour per triangle, never black, lit from above', () => {
    const b = new MeshBuilder();
    b.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], 'body', [0, 0, 1]); // faces up
    b.tri([0, 0, 0], [0, 0, 1], [1, 0, 0], 'body', [0, -1, 0]); // faces a side
    const col = bakeColours(b.mesh(), 0, () => [200, 100, 50]);
    expect(col.length).toBe(24);
    expect(col[0]).toBeGreaterThan(col[12]); // the roof is brighter than a side
    expect(col[12]).toBeGreaterThan(200 * 0.55);
  });
});

describe('placed on the map', () => {
  const bus = { type: 'bus_eu_trailer', x: 0, y: 0, heading: 0, length: 18.75, width: 2.55, height: 4 } as const;
  it('at any heading the model lies inside the plan footprint, nose first', () => {
    for (const heading of [0, 62, 181, 300]) {
      const v = { ...bus, heading };
      const pos = meshToLocal(vehicleMesh(v).pos, v);
      const fwd = { x: Math.sin((heading * Math.PI) / 180), y: Math.cos((heading * Math.PI) / 180) };
      let maxAlong = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const along = pos[i] * fwd.x + pos[i + 1] * fwd.y;
        expect(Math.abs(along)).toBeLessThanOrEqual(v.length / 2 + 0.03);
        maxAlong = Math.max(maxAlong, along);
      }
      expect(maxAlong).toBeGreaterThan(v.length / 2 - 0.05); // the nose is at the heading end
      const [fl, , , rl] = vehicleCorners(v);
      expect(Math.hypot(fl.x - rl.x, fl.y - rl.y)).toBeCloseTo(18.75);
    }
  });
  it('a bus + trailer: coach, drawbar gap, trailer at the back (where the plan puts it)', () => {
    const m = vehicleMesh(bus);
    const bodyAt = (a: number, c: number) => {
      for (let t = 0; t < m.mat.length; t++) {
        if (m.mat[t] !== 'body') continue;
        const f = (m.pos[t * 9] + m.pos[t * 9 + 3] + m.pos[t * 9 + 6]) / 3;
        if (f > a && f < c) return true;
      }
      return false;
    };
    // Plan split (towed): trailer 4.3 m, gap 1 m → coach to 13.45, trailer from 14.45.
    expect(bodyAt(1, 13.3)).toBe(true);
    expect(bodyAt(13.55, 14.4)).toBe(false);
    expect(bodyAt(14.6, 18.7)).toBe(true);
  });
  it('a car has a glass-house on a lower body: the roof is narrower than the car', () => {
    const v = VEHICLES.find((x) => x.type === 'car')!;
    const m = vehicleMesh(v);
    let roofW = 0;
    for (let t = 0; t < m.mat.length; t++) for (let k = 0; k < 3; k++) if (m.pos[t * 9 + k * 3 + 2] > v.height - 0.02) roofW = Math.max(roofW, Math.abs(m.pos[t * 9 + k * 3 + 1]) * 2);
    expect(roofW).toBeLessThan(v.width * 0.85);
  });
});
