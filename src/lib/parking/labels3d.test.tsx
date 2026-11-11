/* 3D labels: nearest first, none touching — five trucks side by side read as one label, not a stack. */

import { describe, expect, it } from 'vitest';
import { labelBox, placeLabels } from './labels3d';

const size = { w: 90, h: 20 };

describe('placeLabels', () => {
  it('five labels on one spot: only the nearest shows', () => {
    const boxes = [5, 4, 3, 2, 1].map((n) => labelBox(`truck-${n}`, { x: 200 + n * 4, y: 300 - n * 4 }, size, 0, 100 + n));
    expect([...placeLabels(boxes)]).toEqual(['truck-1']);
  });

  it('labels spread apart on screen all show', () => {
    const boxes = [0, 1, 2].map((n) => labelBox(`v${n}`, { x: 100 + n * 120, y: 200 }, size, 0, 50 - n));
    expect(placeLabels(boxes).size).toBe(3);
  });

  it('nearer beats farther whatever the list order; ties break by id so it doesn’t flicker', () => {
    const far = labelBox('far', { x: 100, y: 100 }, size, 0, 300);
    const near = labelBox('near', { x: 110, y: 105 }, size, 0, 20);
    expect([...placeLabels([far, near])]).toEqual(['near']);
    const a = labelBox('a', { x: 100, y: 100 }, size, 0, 50);
    const b = labelBox('b', { x: 100, y: 100 }, size, 0, 50);
    expect([...placeLabels([b, a])]).toEqual(['a']);
  });

  it('keeps a small gap: labels 1 px apart don’t both show', () => {
    const a = labelBox('a', { x: 100, y: 100 }, size, 0, 1);
    const b = labelBox('b', { x: 100, y: 121 }, size, 0, 2);
    expect(placeLabels([a, b]).size).toBe(1);
    const c = labelBox('c', { x: 100, y: 130 }, size, 0, 2);
    expect(placeLabels([a, c]).size).toBe(2);
  });

  it('the box sits above its point (bottom-anchored), shifted by the offset', () => {
    expect(labelBox('m', { x: 50, y: 80 }, size, -12, 0)).toMatchObject({ x0: 5, x1: 95, y0: 48, y1: 68 });
  });
});
