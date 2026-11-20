/**
 * Every label on paper is laid out together (Nov 2026, Adam: "still got
 * labelling issues on exports" — area and marker names were drawn where their
 * item sat, over vehicle names, badges and each other).
 */
import { describe, expect, it } from 'vitest';
import { areaLabelSpots, convexOverlap, layoutExtras, markerLabelSpots, rectAt } from './print';

const square = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];

describe('layoutExtras', () => {
  it('takes the first candidate that crosses nothing', () => {
    const blocked = square(0, 0, 40); // a vehicle / name tag at the first spot
    const out = layoutExtras([{ id: 'a', w: 30, h: 10, candidates: [{ x: 20, y: 20 }, { x: 100, y: 20 }] }], [blocked], { w: 400, h: 400 });
    expect(out.get('a')).toEqual({ x: 100, y: 20 });
  });
  it('leaves a label off when nowhere is clear (the key still lists it)', () => {
    const out = layoutExtras([{ id: 'a', w: 30, h: 10, candidates: [{ x: 20, y: 20 }] }], [square(0, 0, 40)], { w: 400, h: 400 });
    expect(out.has('a')).toBe(false);
  });
  it('two labels never stack: the second moves on', () => {
    const c = [{ x: 50, y: 50 }, { x: 50, y: 90 }];
    const out = layoutExtras([{ id: 'a', w: 40, h: 12, candidates: c }, { id: 'b', w: 40, h: 12, candidates: c }], [], { w: 400, h: 400 });
    const ra = rectAt(out.get('a')!, 0, 40, 12);
    const rb = rectAt(out.get('b')!, 0, 40, 12);
    expect(convexOverlap(ra, rb)).toBe(false);
  });
  it('stays on the page', () => {
    const out = layoutExtras([{ id: 'a', w: 60, h: 12, candidates: [{ x: 5, y: 5 }, { x: 60, y: 60 }] }], [], { w: 400, h: 400 });
    expect(out.get('a')).toEqual({ x: 60, y: 60 });
  });
});

describe('where an area or marker name may go', () => {
  it("an area's spots are its centre first, then along its long side — all inside it", () => {
    const strip = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 20 }, { x: 0, y: 20 }];
    const spots = areaLabelSpots(strip);
    expect(spots[0]).toEqual({ x: 100, y: 10 });
    expect(spots.length).toBeGreaterThan(10);
    for (const q of spots.slice(0, 7)) expect(q.y).toBeCloseTo(10); // centre, then along the long side
    for (const q of spots) {
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(200);
      expect(q.y).toBeGreaterThan(0);
      expect(q.y).toBeLessThan(20);
    }
  });
  it('an L-shaped area never offers a spot outside itself', () => {
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 100 }, { x: 0, y: 100 }];
    for (const q of areaLabelSpots(L)) expect(q.x < 20 || q.y < 20).toBe(true);
  });
  it("a marker's name tries right of the icon first, then left, below, above", () => {
    const [r, l, d, u] = markerLabelSpots({ x: 100, y: 100 }, 10, 40, 12, 4);
    expect(r.x).toBeGreaterThan(100);
    expect(l.x).toBeLessThan(100);
    expect(d.y).toBeGreaterThan(100);
    expect(u.y).toBeLessThan(100);
  });
});
