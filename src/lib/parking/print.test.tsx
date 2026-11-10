/* Parking maps — what prints, and what the vehicles look like. */

import { describe, expect, it } from 'vitest';
import { PRINT_FRAME_MM, PRINT_MIN_WIDTH_M, freeSpot, itemPoints, printFrame } from './print';
import { vehicleParts } from './silhouettes';
import { VEHICLES } from './catalogue';
import { addVehicle } from './edit';
import { parseMapBody, type ParkingItem } from './model';
import type { View } from './geo';

const bus = (x: number, y: number, heading = 0, length = 21.5): ParkingItem => ({ id: `b${x}${y}`, kind: 'vehicle', type: 'bus_eu', label: 'Bus', x, y, heading, length, width: 2.55, height: 4 });
const wideScreen = { w: 2400, h: 1200 };
const v = (rotation = 0): View => ({ cx: 300, cy: -200, ppm: 2, rotation });

describe('printFrame — the PDF frames the drawing, not the screen', () => {
  it('Adam’s Leeds export: one bus + two markers no longer prints at 1:1,500', () => {
    const items = [bus(0, 0, 70), { id: 'm1', kind: 'marker', type: 'load_in', label: '', detail: '', x: 4, y: 2 }, { id: 'm2', kind: 'marker', type: 'shore_power', label: '', detail: '', x: 6, y: 1 }] as ParkingItem[];
    const f = printFrame(items, v(), wideScreen);
    expect(f.scale).toBeLessThanOrEqual(500);
    // The bus is at least 40 mm long on paper.
    expect((21.5 * 1000) / f.scale).toBeGreaterThan(40);
    // Centred on the drawing, not on the screen.
    expect(Math.hypot(f.cx - 5, f.cy - 1)).toBeLessThan(12);
  });

  it('a long approach route doesn’t zoom the close-up out (that’s the overview page’s job)', () => {
    const items = [bus(0, 0, 90), { id: 'r', kind: 'route', label: '', points: [{ x: 400, y: -300 }, { x: 0, y: 5 }] }] as ParkingItem[];
    expect(printFrame(items, v(), wideScreen).scale).toBeLessThanOrEqual(500);
    // A drawing that is only a route still frames the route.
    const onlyRoute = printFrame([items[1]], v(), wideScreen);
    expect(onlyRoute.wM).toBeGreaterThan(400);
  });

  it('every parked thing is inside the printed area, at any rotation', () => {
    const items = [bus(0, 0, 30), bus(80, 40, 120), { id: 'm', kind: 'marker', type: 'gate', label: '', detail: '', x: -60, y: -30 }, { id: 'a', kind: 'area', type: 'crew', label: '', points: [{ x: 100, y: 60 }, { x: 120, y: 60 }, { x: 120, y: 90 }] }] as ParkingItem[];
    for (const rot of [0, 33, 90, 271]) {
      const f = printFrame(items, v(rot), wideScreen);
      const r = (rot * Math.PI) / 180;
      for (const p of itemPoints(items)) {
        const dx = p.x - f.cx;
        const dy = p.y - f.cy;
        const u = dx * Math.cos(r) - dy * Math.sin(r);
        const w = dx * Math.sin(r) + dy * Math.cos(r);
        expect(Math.abs(u)).toBeLessThanOrEqual(f.wM / 2);
        expect(Math.abs(w)).toBeLessThanOrEqual(f.hM / 2);
      }
      expect(f.wM).toBeCloseTo((PRINT_FRAME_MM.w * f.scale) / 1000);
    }
  });

  it('always shows some road around a small drawing', () => {
    const f = printFrame([bus(0, 0, 0, 5)], v(), wideScreen);
    expect(f.wM).toBeGreaterThanOrEqual(PRINT_MIN_WIDTH_M);
  });

  it('a chosen scale is kept; an empty map prints the screen', () => {
    expect(printFrame([bus(0, 0)], v(), wideScreen, 250).scale).toBe(250);
    const empty = printFrame([], v(), wideScreen);
    expect([empty.cx, empty.cy]).toEqual([300, -200]);
  });
});

describe('freeSpot — new things don’t land on top of each other', () => {
  it('steps aside along the screen until clear', () => {
    let items: ParkingItem[] = [];
    const spots = [];
    for (let i = 0; i < 3; i++) {
      const at = freeSpot(items, { x: 0, y: 0 }, v());
      spots.push(at);
      items = [...items, { id: `m${i}`, kind: 'marker', type: 'note', label: '', detail: '', ...at }];
    }
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(3);
  });
});

describe('vehicle silhouettes', () => {
  it('every catalogue vehicle has parts, all inside its length (mirrors may poke out sideways)', () => {
    for (const spec of VEHICLES) {
      const parts = vehicleParts(spec.type, spec.length, spec.width);
      expect(parts.length).toBeGreaterThan(1);
      for (const p of parts) {
        expect(p.f0).toBeGreaterThanOrEqual(-0.21);
        expect(p.f1).toBeLessThanOrEqual(spec.length + 0.21);
        if (p.kind !== 'mirror') expect(p.w).toBeLessThanOrEqual(spec.width + 1e-9);
      }
    }
  });

  it('a bus + trailer has a drawbar and a separate trailer at the back', () => {
    const parts = vehicleParts('bus_eu_trailer', 18.75, 2.55);
    const coupling = parts.find((p) => p.kind === 'coupling')!;
    const trailer = parts.filter((p) => p.kind === 'body').at(-1)!;
    expect(trailer.f1).toBeCloseTo(18.75);
    expect(trailer.f1 - trailer.f0).toBeCloseTo(4.3);
    expect(coupling.f1).toBeGreaterThan(trailer.f0);
    expect(parts.filter((p) => p.kind === 'body')).toHaveLength(2);
  });

  it('a US semi has a long hood; an EU artic is a flat-fronted cab', () => {
    expect(vehicleParts('truck_us', 22, 2.6)[0].kind).toBe('hood');
    expect(vehicleParts('truck_eu', 16.5, 2.55)[0].kind).toBe('cab');
  });

  it('a stretched rig keeps its cab and grows its trailer', () => {
    const a = vehicleParts('truck_eu', 16.5, 2.55);
    const b = vehicleParts('truck_eu', 18.5, 2.55);
    expect(b[0].f1).toBe(a[0].f1);
    expect(b.find((p) => p.kind === 'body')!.f1).toBeCloseTo(18.5);
  });

  it('the trailer types pass the server gate', () => {
    const items = addVehicle(addVehicle([], 'bus_eu_trailer', { x: 0, y: 0 }, 0).items, 'bus_us_trailer', { x: 5, y: 0 }, 0).items;
    const m = parseMapBody({ anchor: { lat: 53.8, lng: -1.5 }, view: { cx: 0, cy: 0, ppm: 2, rotation: 0 }, notes: '', items });
    expect(m.items.map((i) => i.kind === 'vehicle' && i.length)).toEqual([18.75, 19]);
  });
});

describe('vehicle colours', () => {
  const body = (colour: unknown) => ({
    anchor: { lat: 53.8, lng: -1.5 },
    view: { cx: 0, cy: 0, ppm: 2, rotation: 0 },
    notes: '',
    items: [{ id: 'b', kind: 'vehicle', type: 'bus_eu', label: 'Bus 1', x: 0, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4, colour }],
  });
  it('a known paint is kept; none or blank means the type colour', () => {
    expect((parseMapBody(body('teal')).items[0] as { colour?: string }).colour).toBe('teal');
    expect('colour' in parseMapBody(body(undefined)).items[0]).toBe(false);
    expect('colour' in parseMapBody(body('')).items[0]).toBe(false);
  });
  it('anything else is refused', () => {
    expect(() => parseMapBody(body('#ff0000'))).toThrow();
    expect(() => parseMapBody(body('chartreuse'))).toThrow();
  });
});
