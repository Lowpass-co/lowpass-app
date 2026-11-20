/** An area's name painted on the ground in 3D (Adam: "area labels are floating, not on the floor"). */
import { describe, expect, it } from 'vitest';
import { floorText, floorTextBounds, GLYPH } from './floorText';

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

describe('floorText', () => {
  it('lies along the long side, centred, and fits inside the area', () => {
    const t = floorText(rect(0, 0, 16, 5), 'FIRE LANE')!;
    expect(t.at).toEqual({ x: 8, y: 2.5 });
    expect(t.u).toEqual({ x: 1, y: 0 });
    expect(t.length).toBeLessThanOrEqual(16);
    expect(t.height).toBeLessThanOrEqual(5 * 0.55 + 1e-9);
    expect(t.length).toBeCloseTo(9 * GLYPH * t.height);
  });
  it('reads left to right whichever way the outline was drawn', () => {
    const back = [...rect(0, 0, 16, 5)].reverse();
    expect(floorText(back, 'X')!.u.x).toBeGreaterThan(0);
    const tall = rect(0, 0, 4, 20);
    expect(floorText(tall, 'X')!.u).toEqual({ x: 0, y: 1 }); // north–south reads south → north
  });
  it('is never microscopic or enormous', () => {
    expect(floorText(rect(0, 0, 1, 0.2), 'No-go area')!.height).toBeGreaterThanOrEqual(0.5);
    expect(floorText(rect(0, 0, 200, 80), 'Crew')!.height).toBeLessThanOrEqual(3);
  });
  it('nothing to write → nothing drawn', () => {
    expect(floorText(rect(0, 0, 10, 4), '  ')).toBeNull();
    expect(floorText([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'A')).toBeNull();
  });
  it('the decal rectangle holds the whole turned text', () => {
    const t = floorText([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 8, y: 12 }, { x: -2, y: 2 }], 'Crew parking')!;
    const [x0, y0, x1, y1] = floorTextBounds(t, 0);
    const perp = { x: -t.u.y, y: t.u.x };
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c = { x: t.at.x + t.u.x * (t.length / 2) * i + perp.x * (t.height / 2) * j, y: t.at.y + t.u.y * (t.length / 2) * i + perp.y * (t.height / 2) * j };
      expect(c.x).toBeGreaterThanOrEqual(x0 - 1e-9);
      expect(c.x).toBeLessThanOrEqual(x1 + 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(y0 - 1e-9);
      expect(c.y).toBeLessThanOrEqual(y1 + 1e-9);
    }
  });
});
