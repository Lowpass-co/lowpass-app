import { describe, it, expect } from 'vitest';
import { splitRoute } from './routes3d';
import type { Pt } from './geo';

// A building from x=10 to x=20 (any y). Outside it: the street (null).
const inside = (p: Pt) => (p.x >= 10 && p.x <= 20 ? 'hall' : null);

describe('splitRoute — a route in 3D lies on the floor it crosses', () => {
  it('a route wholly on the street is one draped run', () => {
    const runs = splitRoute([{ x: 0, y: 0 }, { x: 5, y: 5 }], inside);
    expect(runs).toEqual([{ zone: null, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }]);
  });

  it('bus outside → door inside: a street run, then a floor run, joined', () => {
    const runs = splitRoute([{ x: 0, y: 0 }, { x: 15, y: 0 }], inside);
    expect(runs.map((r) => r.zone)).toEqual([null, 'hall']);
    const [street, hall] = runs;
    // No gap: the street run ends where the floor run starts…
    expect(street.points[street.points.length - 1]).toEqual(hall.points[0]);
    // …at the wall, to within one sample.
    expect(hall.points[0].x).toBeGreaterThanOrEqual(10);
    expect(hall.points[0].x).toBeLessThanOrEqual(10.5);
    expect(hall.points[hall.points.length - 1]).toEqual({ x: 15, y: 0 });
  });

  it('in and out again: three runs, and the route keeps its corners', () => {
    const runs = splitRoute([{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 10 }, { x: 30, y: 10 }], inside);
    expect(runs.map((r) => r.zone)).toEqual([null, 'hall', null]);
    expect(runs[1].points).toContainEqual({ x: 15, y: 0 });
    expect(runs[1].points).toContainEqual({ x: 15, y: 10 });
    expect(runs[2].points[runs[2].points.length - 1]).toEqual({ x: 30, y: 10 });
  });

  it('keeps only ends and corners — not every sample', () => {
    const runs = splitRoute([{ x: 11, y: 0 }, { x: 19, y: 0 }], inside, 0.1);
    expect(runs).toEqual([{ zone: 'hall', points: [{ x: 11, y: 0 }, { x: 19, y: 0 }] }]);
  });

  it('nothing to draw for a single point', () => {
    expect(splitRoute([{ x: 1, y: 1 }], inside)).toEqual([]);
  });
});
