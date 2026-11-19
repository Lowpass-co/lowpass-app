import { describe, expect, it } from 'vitest';
import { rimRuns, wallRing, wallSegments, wallShade } from './walls3d';

const square = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
]; // anticlockwise

describe('wallRing', () => {
  it('splits long edges so the wall top can follow a curved roof', () => {
    const ring = wallRing(square, 8);
    expect(ring).toHaveLength(12); // 3 per 20 m edge
    expect(ring[0]).toEqual({ x: 0, y: 0 });
    expect(ring[3]).toEqual({ x: 20, y: 0 });
  });
  it('caps the number of points', () => {
    expect(wallRing(square, 0.1, 40).length).toBeLessThanOrEqual(40);
  });
  it('needs a polygon', () => {
    expect(wallRing(square.slice(0, 2))).toEqual([]);
  });
});

describe('wallShade', () => {
  it('lights the wall facing north-west into the room, darkens the one facing south-east', () => {
    // Anticlockwise square: the south edge (0,0)→(20,0) faces north (into the room), the north edge faces south.
    const facingNorth = wallShade(square[0], square[1], true);
    const facingSouth = wallShade(square[2], square[3], true);
    expect(facingNorth).toBeGreaterThan(facingSouth);
    expect(facingNorth).toBeLessThanOrEqual(1);
    expect(facingSouth).toBeGreaterThanOrEqual(0.55);
  });
  it('gives the same face the same tone whichever way the outline was drawn', () => {
    expect(wallShade(square[1], square[0], false)).toBe(wallShade(square[0], square[1], true));
  });
});

describe('wallSegments', () => {
  it('runs a wall from the floor up to the roof height at each end', () => {
    const ws = wallSegments(square, [30, 31, 32, 33], 2);
    expect(ws).toHaveLength(4);
    expect(ws[0]).toMatchObject({ a: square[0], b: square[1], topA: 30, topB: 31, bottom: 2 });
  });
  it('leaves out an edge with no roof over it (open street) and unsampled ends', () => {
    // Edge 0→1 sits at street level both ends; edge 2→3 has an unsampled end.
    const ws = wallSegments(square, [2.5, 2.1, 20, null], 2);
    expect(ws.map((w) => [w.a, w.b])).toEqual([[square[1], square[2]]]);
  });
  it('never puts a wall top below the floor', () => {
    const ws = wallSegments(square, [10, 0, 10, 10], 2);
    expect(ws[0].topB).toBe(2);
  });
});

describe('rimRuns', () => {
  it('runs one line along the wall tops of an unbroken stretch', () => {
    const runs = rimRuns(wallSegments(square, [30, 31, 32, 33], 2));
    expect(runs).toHaveLength(1);
    expect(runs[0][0]).toEqual([0, 0, 30]);
    expect(runs[0]).toHaveLength(5); // all the way round, back to the start
  });
  it('breaks where an edge has no wall (open street) and rejoins across the start', () => {
    // Edge 1→2 is open street (both ends at street level); the rest have walls — one run 2→3→0→1.
    const runs = rimRuns(wallSegments(square, [30, 2, 2, 30], 2));
    expect(runs).toHaveLength(1);
    expect(runs[0].map(([x, y]) => [x, y])).toEqual([
      [20, 20],
      [0, 20],
      [0, 0],
      [20, 0],
    ]);
  });
});
