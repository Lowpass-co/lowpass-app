import { describe, expect, it } from 'vitest';
import { badgeRadii, convexOverlap, insideName, layoutNames, rectAt, vehicleNumbers } from './print';
import type { ParkingItem } from './model';

const v = (id: string, x: number, y: number) => ({ id, kind: 'vehicle', type: 'car', x, y, heading: 0, length: 5, width: 2, label: '' }) as unknown as ParkingItem;

describe('vehicleNumbers', () => {
  it('numbers a row in order along it, starting north-west', () => {
    const items = [v('c', 10, 0), v('a', 0, 0), v('d', 15, 0), v('b', 5, 0)];
    const n = vehicleNumbers(items);
    expect(['a', 'b', 'c', 'd'].map((id) => n.get(id))).toEqual([1, 2, 3, 4]);
  });
  it('finishes one group before jumping to the next', () => {
    const items = [v('far1', 200, 0), v('near1', 0, 0), v('far2', 205, 0), v('near2', 4, 0)];
    const n = vehicleNumbers(items);
    expect(n.get('near1')).toBe(1);
    expect(n.get('near2')).toBe(2);
    expect([n.get('far1'), n.get('far2')].sort()).toEqual([3, 4]);
  });
  it('ignores everything that is not a vehicle, and is the same every time', () => {
    const items = [v('a', 0, 0), { id: 'm', kind: 'marker', type: 'gate', x: 1, y: 1, label: '', detail: '' } as unknown as ParkingItem, v('b', 3, 0)];
    expect([...vehicleNumbers(items)]).toEqual([...vehicleNumbers([...items].reverse())]);
    expect(vehicleNumbers(items).has('m')).toBe(false);
  });
});

describe('badgeRadii', () => {
  it('keeps the full size when there is room, shrinks when badges would touch, never below the minimum', () => {
    const r = badgeRadii([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 110, y: 0 }, { x: 113, y: 0 }], 12, 4);
    expect(r[0]).toBe(12);
    expect(r[1]).toBeCloseTo(4.8);
    expect(r[3]).toBe(4);
  });
});

describe('convexOverlap', () => {
  const sq = (x: number, y: number, s = 10) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
  it('sees overlap and separation', () => {
    expect(convexOverlap(sq(0, 0), sq(5, 5))).toBe(true);
    expect(convexOverlap(sq(0, 0), sq(20, 0))).toBe(false);
    expect(convexOverlap(sq(0, 0), sq(10, 0))).toBe(false); // touching only
  });
  it('handles turned rectangles', () => {
    expect(convexOverlap(rectAt({ x: 0, y: 0 }, 45, 20, 2), sq(8, 8, 4))).toBe(false);
    expect(convexOverlap(rectAt({ x: 0, y: 0 }, 45, 20, 2), sq(2, 2, 4))).toBe(true);
  });
});

describe('layoutNames — names first', () => {
  // A vehicle 60 × 12 px lying along x; its tag 40 × 10.
  const body = (c: { x: number; y: number }, angle = 0) => rectAt(c, angle, 60, 12);
  const spot = (id: string, c: { x: number; y: number }, angle = 0) => ({ id, centre: c, angle, halfWidth: 6, halfLength: 30, w: 40, h: 10 });
  const B = { w: 600, h: 600 };

  it('a lone vehicle is named just past its end, along it', () => {
    const out = layoutNames([spot('a', { x: 200, y: 200 })], [body({ x: 200, y: 200 })], B);
    expect(out.get('a')).toMatchObject({ how: 'end', angle: 0, at: { x: 252, y: 200 } });
  });

  it('a row of vehicles side by side is named at their ends — every one of them', () => {
    const cs = [0, 1, 2, 3, 4].map((i) => ({ x: 200, y: 200 + i * 14 }));
    const out = layoutNames(cs.map((c, i) => spot(String(i), c)), cs.map((c) => body(c)), B);
    expect([...out.values()].map((p) => p.how)).toEqual(['end', 'end', 'end', 'end', 'end']);
  });

  it('nose to tail with no room at the ends: beside, on the open side', () => {
    const cs = [{ x: 200, y: 200 }, { x: 263, y: 200 }, { x: 137, y: 200 }];
    const out = layoutNames([spot('a', cs[0])], cs.map((c) => body(c)), B);
    expect(out.get('a')).toMatchObject({ how: 'side' });
  });

  it('boxed in on every side: a callout, upright, with a leader line back to it', () => {
    const c = { x: 300, y: 300 };
    const ring = [
      { x: 363, y: 300 },
      { x: 237, y: 300 },
      { x: 300, y: 286 },
      { x: 300, y: 314 },
      { x: 363, y: 286 },
      { x: 237, y: 286 },
      { x: 363, y: 314 },
      { x: 237, y: 314 },
    ];
    const out = layoutNames([spot('a', c)], [body(c), ...ring.map((q) => body(q))], B);
    expect(out.get('a')).toMatchObject({ how: 'callout', angle: 0, leader: c });
  });

  it('never off the picture, never on a vehicle or another tag', () => {
    const cs = [{ x: 30, y: 30 }, { x: 30, y: 44 }];
    const out = layoutNames(cs.map((c, i) => spot(String(i), c)), cs.map((c) => body(c)), B);
    const tags = [...out.values()].map((p) => rectAt(p.at, p.angle, 40, 10));
    for (const t of tags) {
      expect(t.every((q) => q.x >= 0 && q.y >= 0)).toBe(true);
      for (const c of cs) expect(convexOverlap(t, body(c))).toBe(false);
    }
    expect(convexOverlap(tags[0], tags[1])).toBe(false);
  });
});

describe('insideName', () => {
  it('waits until the vehicle is big enough on screen, then sits before the badge', () => {
    expect(insideName(40, 6, 6, 5, 20, 7)).toBeNull(); // zoomed out: a sliver
    const at = insideName(400, 60, 12, 5, 20, 7)!;
    expect(at.size).toBe(20); // capped
    expect(at.offset).toBeLessThan(-12); // clear of the badge
    expect(-at.offset + (5 * 0.6 * at.size) / 2).toBeLessThanOrEqual(200); // inside the half-length
  });
  it('a thin vehicle limits the size by its width', () => {
    expect(insideName(400, 12, 6, 4, 20, 7)!.size).toBeCloseTo(8.64);
    expect(insideName(400, 8, 6, 4, 20, 7)).toBeNull();
  });
});
