/* Reading a venue drawing with AI — nothing the model says is trusted as is. */

import { describe, expect, it } from 'vitest';
import { REFINE_PX, endBox, jsonOf, parseOverview, parseRefine, pickDimensions, rotationFromNorth, toSourcePt, type ReadDimension } from './drawingRead';
import { agreement, scaleFromDimension } from './drawings';

const W = 2576;
const H = 1821;

describe('parseOverview', () => {
  it('keeps a sensible read, in image pixels', () => {
    const r = parseOverview(
      {
        crop: [100, 80, 2200, 1500],
        dimensions: [
          { text: '16', metres: 16, a: [610, 445], b: [878, 437], confidence: 0.9 },
          { text: '24.08', metres: 24.08, a: [1685, 425], b: [2090, 411], confidence: 0.8 },
        ],
        north: -30,
        scale: ' 1:500 @ A1 ',
      },
      W,
      H,
    );
    expect(r.crop).toEqual({ x0: 100, y0: 80, x1: 2200, y1: 1500 });
    expect(r.dimensions.map((d) => d.metres)).toEqual([16, 24.08]);
    expect(r.north).toBe(330);
    expect(r.scaleText).toBe('1:500 @ A1');
  });

  it('drops junk: no number, points off the page, absurd lengths, a crop that is a detail', () => {
    const r = parseOverview(
      {
        crop: [100, 100, 150, 150],
        dimensions: [
          { text: 'x', metres: 'sixteen', a: [1, 1], b: [500, 1] },
          { text: '16', metres: 16, a: [5000, 1], b: [500, 1] },
          { text: '9999', metres: 9999, a: [1, 1], b: [500, 1] },
          { text: '16', metres: 16, a: [10, 10], b: [12, 10] },
          'garbage',
        ],
        north: 'up',
      },
      W,
      H,
    );
    expect(r).toEqual({ crop: null, dimensions: [], north: null, scaleText: null });
    expect(parseOverview(null, W, H).dimensions).toEqual([]);
  });

  it('pulls the JSON out of a chatty reply, or gives up cleanly', () => {
    expect(jsonOf('Here you go:\n{"north": 0}\nHope that helps')).toEqual({ north: 0 });
    expect(jsonOf('no idea')).toBeNull();
    expect(jsonOf('{broken')).toBeNull();
  });
});

describe('choosing the two dimensions', () => {
  const dim = (text: string, a: [number, number], b: [number, number], confidence = 0.8): ReadDimension => ({
    text,
    metres: Number(text),
    a: { x: a[0], y: a[1] },
    b: { x: b[0], y: b[1] },
    confidence,
  });

  it('prefers a second one in another direction, and never the same line twice', () => {
    const along = dim('16', [0, 0], [500, 0]);
    const sameReversed = dim('16', [500, 0], [0, 0]);
    const parallel = dim('24.08', [0, 100], [750, 100]);
    const across = dim('12', [0, 0], [0, 380]);
    const picked = pickDimensions([sameReversed, along, parallel, across]);
    expect(picked).toHaveLength(2);
    expect(picked[1].text).toBe('12');
  });

  it('one dimension is one; none is none', () => {
    expect(pickDimensions([dim('16', [0, 0], [500, 0])])).toHaveLength(1);
    expect(pickDimensions([])).toEqual([]);
  });
});

describe('close-ups bring the precision', () => {
  // The S2 drawing: an A3 page of 1191 × 842 pt; the 16 m bay runs from
  // (282, 206.4) to (405.6, 202.8); the 24.08 m from (778.8, 196.1) to (966, 189.6).
  const page = { w: 1191, h: 842 };
  const overview = { w: W, h: Math.round((W * 842) / 1191) };
  const whole = { u0: 0, v0: 0, u1: 1191, v1: 842 };

  it('maps image pixels back to PDF points', () => {
    const p = toSourcePt({ x: W / 2, y: overview.h / 2 }, whole, overview);
    expect(p.u).toBeCloseTo(595.5);
    expect(p.v).toBeCloseTo(421, 0);
  });

  it('a 15 px slip on the whole page is a ~11 % scale error; the same slip in close-ups is under 1 %', () => {
    const k = W / 1191; // px per pt on the overview
    const slip = 15;
    const a = { u: 282, v: 206.4 };
    const b = { u: 405.6, v: 202.8 };
    // Overview: both ends read 15 px outwards along the line.
    const rough = scaleFromDimension({ u: a.u - slip / k, v: a.v }, { u: b.u + slip / k, v: b.v }, 16)!;
    const truth = scaleFromDimension(a, b, 16)!;
    expect(Math.abs(agreement(truth, rough))).toBeGreaterThan(5);
    // Close-ups: the same 15 px slip, in a box rendered at 1,000 px.
    const len = Math.hypot(b.u - a.u, b.v - a.v);
    const boxA = endBox(a, len, page);
    const boxB = endBox(b, len, page);
    const img = { w: REFINE_PX, h: REFINE_PX };
    const centre = { x: REFINE_PX / 2, y: REFINE_PX / 2 };
    const ra = toSourcePt({ x: centre.x - slip, y: centre.y }, boxA, img);
    const rb = toSourcePt({ x: centre.x + slip, y: centre.y }, boxB, img);
    const refined = scaleFromDimension(ra, rb, 16)!;
    expect(Math.abs(agreement(truth, refined))).toBeLessThan(1);
    expect(Math.abs(agreement(truth, rough)) / Math.abs(agreement(truth, refined))).toBeGreaterThan(10);
    // …and the box still holds the overview's slip, twice over.
    expect(a.u - boxA.u0).toBeGreaterThan((2 * slip) / k);
  });

  it('refined ends are points in their own close-up, or null', () => {
    const sizes: [{ w: number; h: number }, { w: number; h: number }] = [{ w: 1000, h: 1000 }, { w: 1000, h: 1000 }];
    expect(parseRefine({ ends: [[480, 510], null] }, sizes)).toEqual([{ x: 480, y: 510 }, null]);
    expect(parseRefine({ ends: [[4800, 510], [1, 2]] }, sizes)).toEqual([null, { x: 1, y: 2 }]);
    expect(parseRefine('nope', sizes)).toEqual([null, null]);
  });

  it('north to the right means the page’s up faces west', () => {
    expect(rotationFromNorth(90)).toBe(270);
    expect(rotationFromNorth(0)).toBe(0);
  });
});
