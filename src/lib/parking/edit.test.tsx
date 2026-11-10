/* Parking maps — editing rules. */

import { describe, expect, it } from 'vitest';
import { addMarker, addVehicle, duplicateItem, duplicateItems, finishDraft, groupCentre, itemsInBox, moveItem, moveItems, record, redo, removeItem, removeItems, toggleSelection, turnItems, undo, type History } from './edit';
import { dist, project } from './geo';
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

describe('several at once', () => {
  const bus = (id: string, x: number, y: number, heading = 0): ParkingItem => ({ id, kind: 'vehicle', type: 'bus_eu', label: id, x, y, heading, length: 13.5, width: 2.55, height: 4 });
  const row = [bus('a', 0, 0), bus('b', 4, 0), bus('c', 8, 0), { id: 'm', kind: 'marker', type: 'gate', label: '', detail: '', x: 30, y: 30 } as ParkingItem];

  it('Cmd/Ctrl/Shift-click adds, and takes out what is already in', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('move / delete touch only the selection', () => {
    const moved = moveItems(row, ['a', 'c'], { x: 1, y: 2 });
    expect(moved.map((i) => (i.kind === 'vehicle' || i.kind === 'marker' ? [i.x, i.y] : null))).toEqual([[1, 2], [4, 0], [9, 2], [30, 30]]);
    expect(removeItems(row, ['a', 'm']).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('a group turns as one block: a row stays a row, headings turn with it', () => {
    const t = turnItems(row, ['a', 'b', 'c'], 90);
    const [a, b, c] = t as Extract<ParkingItem, { kind: 'vehicle' }>[];
    expect([a.heading, b.heading, c.heading]).toEqual([90, 90, 90]);
    // Turned clockwise about the middle bus: the east–west row is now north–south.
    expect(b.x).toBeCloseTo(4);
    expect(b.y).toBeCloseTo(0);
    expect(a.x).toBeCloseTo(4);
    expect(a.y).toBeCloseTo(4);
    expect(dist(a, c)).toBeCloseTo(8);
    expect(t[3]).toBe(row[3]); // not selected: untouched
  });

  it('turning again and again spins in place (no creep), and 72 × 5° comes home', () => {
    const ids = ['a', 'b', 'm'];
    const c0 = groupCentre(row, ids)!;
    let t = row;
    for (let k = 0; k < 72; k++) t = turnItems(t, ids, 5);
    const c1 = groupCentre(t, ids)!;
    expect(dist(c0, c1)).toBeLessThan(0.01);
    for (const [i, j] of t.map((x, n) => [x, row[n]])) {
      if (i.kind === 'vehicle' && j.kind === 'vehicle') {
        expect(dist(i, j)).toBeLessThan(0.02);
        expect(i.heading).toBe(j.heading);
      }
    }
  });

  it('areas, routes and measures turn by their points', () => {
    const shapes: ParkingItem[] = [
      { id: 'r', kind: 'route', label: '', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { id: 'q', kind: 'measure', a: { x: 0, y: 0 }, b: { x: 0, y: 10 } },
    ];
    const t = turnItems(shapes, ['r', 'q'], 180);
    const r = t[0] as Extract<ParkingItem, { kind: 'route' }>;
    expect(dist(r.points[0], r.points[1])).toBeCloseTo(10);
  });

  it('duplicate copies every selected item and names the vehicles on', () => {
    const d = duplicateItems(row, ['a', 'b'], { x: 0, y: -10 });
    expect(d.ids).toHaveLength(2);
    const copies = d.items.filter((i) => d.ids.includes(i.id)) as Extract<ParkingItem, { kind: 'vehicle' }>[];
    expect(new Set(copies.map((c) => c.label)).size).toBe(2);
    expect(copies.every((c) => c.y === -10)).toBe(true);
  });

  it('a box on screen takes anything with a point inside it', () => {
    const view = { cx: 4, cy: 0, ppm: 10, rotation: 30 };
    const [w, h] = [800, 600];
    const s = project(view, w, h, { x: 8, y: 0 });
    // A small box around bus c's centre catches only c.
    expect(itemsInBox(row, view, w, h, { x: s.x - 5, y: s.y - 5 }, { x: s.x + 5, y: s.y + 5 })).toEqual(['c']);
    // The whole screen catches the buses; the gate at 30,30 is off it.
    expect(itemsInBox(row, view, w, h, { x: 0, y: 0 }, { x: w, y: h })).toEqual(['a', 'b', 'c']);
  });
});
