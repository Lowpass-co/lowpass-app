import { describe, expect, it } from 'vitest';
import { badgeRadii, convexOverlap, insideName, placeNames, rectAt, vehicleNumbers } from './print';
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

describe('placeNames', () => {
  const body = (c: { x: number; y: number }) => rectAt(c, 0, 60, 12);
  const spot = (id: string, c: { x: number; y: number }) => ({ id, centre: c, angle: 0, halfWidth: 6, w: 40, h: 10 });
  it('puts a lone vehicle\'s name just off its side', () => {
    const out = placeNames([spot('a', { x: 100, y: 100 })], [body({ x: 100, y: 100 })], { w: 400, h: 400 });
    expect(out.get('a')).toEqual({ x: 100, y: 113 });
  });
  it('leaves names out of a tight row, but names the ends', () => {
    // Five vehicles 14 px apart: a name (10 px tall + gaps) fits on neither side between them.
    const cs = [0, 1, 2, 3, 4].map((i) => ({ x: 100, y: 100 + i * 14 }));
    const out = placeNames(cs.map((c, i) => spot(String(i), c)), cs.map(body), { w: 400, h: 400 });
    expect([...out.keys()].sort()).toEqual(['0', '4']);
  });
  it('never places a name off the picture', () => {
    const out = placeNames([spot('a', { x: 100, y: 4 })], [], { w: 400, h: 400 });
    expect(out.get('a')).toEqual({ x: 100, y: 17 });
    expect(placeNames([spot('a', { x: 5, y: 100 })], [], { w: 400, h: 400 }).has('a')).toBe(false);
  });
});

describe('placeNames — never sandwiched', () => {
  it('puts the name on the open side, not in the gap between two vehicles', () => {
    const body = (c: { x: number; y: number }) => rectAt(c, 0, 60, 12);
    // Gap of 20 px between bodies: a 10 px name fits in it, but it would be ambiguous.
    const a = { x: 100, y: 100 };
    const b = { x: 100, y: 132 };
    const out = placeNames([{ id: 'a', centre: a, angle: 0, halfWidth: 6, w: 40, h: 10 }], [body(a), body(b)], { w: 400, h: 400 });
    expect(out.get('a')).toEqual({ x: 100, y: 87 });
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
