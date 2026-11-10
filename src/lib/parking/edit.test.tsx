/* Parking maps — editing rules. */

import { describe, expect, it } from 'vitest';
import { addMarker, addVehicle, duplicateItem, finishDraft, moveItem, record, redo, removeItem, undo, type History } from './edit';
import { parseMapBody, type ParkingItem } from './model';

describe('adding', () => {
  it('a new bus gets the catalogue size, the next free name and the view heading', () => {
    const one = addVehicle([], 'bus_eu', { x: 1.23456, y: 2 }, 33.4);
    const two = addVehicle(one.items, 'bus_eu', { x: 0, y: 0 }, -90);
    const [a, b] = two.items as Extract<ParkingItem, { kind: 'vehicle' }>[];
    expect(a).toMatchObject({ label: 'Bus 1', length: 13.5, width: 2.55, height: 4, x: 1.235, heading: 33 });
    expect(b).toMatchObject({ label: 'Bus 2', heading: 270 });
  });

  it('an unknown type adds nothing', () => {
    expect(addVehicle([], 'hovercraft' as never, { x: 0, y: 0 }, 0).items).toHaveLength(0);
    expect(addMarker([], 'portal' as never, { x: 0, y: 0 }).items).toHaveLength(0);
  });

  it('everything added passes the server gate', () => {
    let items: ParkingItem[] = addVehicle([], 'truck_us', { x: 4, y: 5 }, 0).items;
    items = addMarker(items, 'shore_power', { x: 1, y: 1 }).items;
    items = finishDraft(items, 'route', [{ x: 0, y: 0 }, { x: 10, y: 10 }])!.items;
    items = finishDraft(items, 'area', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 'guest')!.items;
    items = finishDraft(items, 'measure', [{ x: 0, y: 0 }, { x: 3, y: 4 }])!.items;
    const body = { anchor: { lat: 53.8, lng: -1.5 }, view: { cx: 0, cy: 0, ppm: 2, rotation: 0 }, notes: '', items };
    expect(parseMapBody(JSON.parse(JSON.stringify(body))).items).toHaveLength(5);
  });
});

describe('drawing', () => {
  it('a double-click finish (repeated last point) is ignored', () => {
    const r = finishDraft([], 'route', [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 }]);
    expect(r && r.items[0].kind === 'route' && r.items[0].points).toHaveLength(2);
  });

  it('too few points make nothing', () => {
    expect(finishDraft([], 'route', [{ x: 0, y: 0 }])).toBeNull();
    expect(finishDraft([], 'area', [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    expect(finishDraft([], 'measure', [{ x: 0, y: 0 }, { x: 0.01, y: 0 }])).toBeNull();
  });
});

describe('moving', () => {
  it('moves every point of a shape by the same amount', () => {
    const area = finishDraft([], 'area', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])!.items[0];
    const moved = moveItem(area, { x: 2, y: -1 });
    expect(moved.kind === 'area' && moved.points).toEqual([{ x: 2, y: -1 }, { x: 12, y: -1 }, { x: 12, y: 9 }]);
    const m = finishDraft([], 'measure', [{ x: 0, y: 0 }, { x: 3, y: 4 }])!.items[0];
    const mm = moveItem(m, { x: 1, y: 1 });
    expect(mm.kind === 'measure' && [mm.a, mm.b]).toEqual([{ x: 1, y: 1 }, { x: 4, y: 5 }]);
  });

  it('duplicate is offset and renamed', () => {
    const one = addVehicle([], 'bus_us', { x: 0, y: 0 }, 0);
    const d = duplicateItem(one.items, one.id, { x: 4, y: 0 })!;
    const copy = d.items[1] as Extract<ParkingItem, { kind: 'vehicle' }>;
    expect(copy).toMatchObject({ x: 4, label: 'Bus 2' });
    expect(copy.id).not.toBe(one.id);
    expect(removeItem(d.items, one.id)).toHaveLength(1);
  });
});

describe('undo / redo', () => {
  it('walks back and forward, and a new change clears redo', () => {
    let h: History<number> = { past: [], future: [] };
    let v = 1;
    h = record(h, v); v = 2;
    h = record(h, v); v = 3;
    const u1 = undo(h, v)!; h = u1.h; v = u1.value;
    expect(v).toBe(2);
    const u2 = undo(h, v)!; h = u2.h; v = u2.value;
    expect(v).toBe(1);
    expect(undo(h, v)).toBeNull();
    const r1 = redo(h, v)!; h = r1.h; v = r1.value;
    expect(v).toBe(2);
    h = record(h, v); v = 9;
    expect(redo(h, v)).toBeNull();
  });
});
