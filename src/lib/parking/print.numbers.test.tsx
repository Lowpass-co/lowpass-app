import { describe, expect, it } from 'vitest';
import { badgeRadii, vehicleNumbers } from './print';
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
