/* Venue drawings — placing a drawing on the ground at true scale. */

import { describe, expect, it } from 'vitest';
import {
  CHECK_WARN_PCT,
  agreement,
  clearOf,
  drawingUnder,
  footprint,
  headroomWarnings,
  itemFloor,
  levelLabel,
  levelsOf,
  pinDrawing,
  placeAt,
  scaleFromDimension,
  shiftDrawings,
  svgMatrix,
  toGround,
  toSource,
} from './drawings';
import { dist, toLatLng } from './geo';
import { LIMITS, parseDrawings, parseMapBody, type MarkerItem, type ParkingDrawing, type ParkingItem } from './model';

const drawing = (o: Partial<ParkingDrawing> = {}): ParkingDrawing => ({
  id: 'd1',
  fileId: '0b6c1c9e-1d2f-4a8b-9c3d-5e6f7a8b9c0d',
  name: 'S2 Truck Parking.pdf',
  kind: 'pdf',
  page: 1,
  srcW: 1191,
  srcH: 842,
  crop: { u0: 0, v0: 0, u1: 1191, v1: 842 },
  scale: 0.1,
  calib: null,
  x: 0,
  y: 0,
  rotation: 0,
  pinned: false,
  pinCheck: null,
  opacity: 0.85,
  hidden: false,
  inside: false,
  floor: 0,
  clearHeight: null,
  ...o,
});

describe('where a drawing sits', () => {
  it('toSource undoes toGround, at any placement', () => {
    for (const rotation of [0, 17, 90, 233.5]) {
      const d = drawing({ x: 12.3, y: -40, scale: 0.0873, rotation });
      for (const p of [{ u: 0, v: 0 }, { u: 500, v: 300 }, { u: 1191, v: 842 }]) {
        const back = toSource(d, toGround(d, p));
        expect(back.u).toBeCloseTo(p.u, 6);
        expect(back.v).toBeCloseTo(p.v, 6);
      }
    }
  });

  it('up the page is north at rotation 0, east at 90 (compass sense)', () => {
    const top = { u: 0, v: 0 };
    const below = { u: 0, v: 100 };
    const n = (rot: number) => {
      const d = drawing({ rotation: rot, scale: 1 });
      const a = toGround(d, below);
      const b = toGround(d, top);
      return { x: b.x - a.x, y: b.y - a.y };
    };
    expect(n(0).x).toBeCloseTo(0);
    expect(n(0).y).toBeCloseTo(100);
    expect(n(90).x).toBeCloseTo(100);
    expect(n(90).y).toBeCloseTo(0);
  });

  it('the SVG matrix lands every source point where toGround says (scene y = −north)', () => {
    const d = drawing({ x: 5, y: 7, scale: 0.05, rotation: 33 });
    const [a, b, c, dd, e, f] = svgMatrix(d);
    for (const p of [{ u: 10, v: 20 }, { u: 900, v: 400 }]) {
      const g = toGround(d, p);
      expect(a * p.u + c * p.v + e).toBeCloseTo(g.x, 9);
      expect(b * p.u + dd * p.v + f).toBeCloseTo(-g.y, 9);
    }
  });

  it('the footprint is the crop, at true size', () => {
    const d = drawing({ scale: 0.1, crop: { u0: 100, v0: 100, u1: 300, v1: 200 }, rotation: 40 });
    const f = footprint(d);
    expect(dist(f[0], f[1])).toBeCloseTo(20);
    expect(dist(f[1], f[2])).toBeCloseTo(10);
  });
});

describe('scale', () => {
  // The bp pulse LIVE "S2 Truck Parking" drawing, measured at 300 dpi: each bay
  // labelled 16 m spans ~516 px; the gate dimension 24.08 m spans ~780 px.
  it('a dimension sets it; a second one checks it (the real S2 drawing agrees within 1 %)', () => {
    const px = 72 / 300; // 300 dpi pixels → PDF points
    const s = scaleFromDimension({ u: 0, v: 0 }, { u: 516 * px, v: 0 }, 16)!;
    const check = scaleFromDimension({ u: 0, v: 0 }, { u: 780 * px, v: 0 }, 24.08)!;
    expect(Math.abs(agreement(s, check))).toBeLessThan(1);
    expect(Math.abs(agreement(s, check))).toBeLessThan(CHECK_WARN_PCT);
  });

  it('refuses a dimension with no length or no number', () => {
    expect(scaleFromDimension({ u: 5, v: 5 }, { u: 5.2, v: 5 }, 16)).toBeNull();
    expect(scaleFromDimension({ u: 0, v: 0 }, { u: 100, v: 0 }, 0)).toBeNull();
  });
});

describe('pinning to the satellite', () => {
  const truth = drawing({ x: 40, y: -25, scale: 0.0861, rotation: 127.5 });
  const A = { u: 120, v: 300 };
  const B = { u: 980, v: 610 };

  it('two matched points recover the placement exactly; the satellite agrees (0 %)', () => {
    const p = pinDrawing(truth.scale, [A, B], [toGround(truth, A), toGround(truth, B)])!;
    expect(p.rotation).toBeCloseTo(127.5, 6);
    expect(p.x).toBeCloseTo(40, 6);
    expect(p.y).toBeCloseTo(-25, 6);
    expect(p.pinCheck).toBeCloseTo(0, 6);
  });

  it('a satellite that reads 5 % bigger is reported, and the error splits around the middle', () => {
    const gA = toGround(truth, A);
    const gB = toGround(truth, B);
    const mid = { x: (gA.x + gB.x) / 2, y: (gA.y + gB.y) / 2 };
    const stretch = (g: { x: number; y: number }) => ({ x: mid.x + (g.x - mid.x) * 1.05, y: mid.y + (g.y - mid.y) * 1.05 });
    const p = pinDrawing(truth.scale, [A, B], [stretch(gA), stretch(gB)])!;
    expect(p.pinCheck).toBeCloseTo(5, 6);
    expect(p.rotation).toBeCloseTo(127.5, 6);
    const placed = { ...truth, ...p };
    const m = toGround(placed, { u: (A.u + B.u) / 2, v: (A.v + B.v) / 2 });
    expect(dist(m, mid)).toBeLessThan(1e-6);
  });

  it('points on top of each other can’t fix a direction', () => {
    expect(pinDrawing(0.1, [A, { u: A.u + 1, v: A.v }], [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeNull();
  });

  it('placing by hand centres the crop', () => {
    const d = drawing({ scale: 0.1, crop: { u0: 200, v0: 100, u1: 400, v1: 300 } });
    const p = placeAt(d, { x: 10, y: 20 }, 30);
    const c = toGround({ ...d, ...p }, { u: 300, v: 200 });
    expect(c.x).toBeCloseTo(10);
    expect(c.y).toBeCloseTo(20);
  });

  it('reused at the same venue from a map with a different pin, it lands in the same real place', () => {
    const oldAnchor = { lat: 52.4532, lng: -1.7186 };
    const newAnchor = { lat: 52.4533891, lng: -1.7183455 };
    const d = drawing({ x: 30, y: -12, scale: 0.08, rotation: 20 });
    const [moved] = shiftDrawings([d], oldAnchor, newAnchor);
    const before = toLatLng(oldAnchor, toGround(d, { u: 400, v: 400 }));
    const after = toLatLng(newAnchor, toGround(moved, { u: 400, v: 400 }));
    expect(Math.abs(before.lat - after.lat) * 111_000).toBeLessThan(0.05);
    expect(Math.abs(before.lng - after.lng) * 68_000).toBeLessThan(0.05);
  });
});

describe('levels', () => {
  // A 100 m × 60 m dock drawing (scale 0.1 over 1000 × 600 units) centred on 0,0.
  const dock = drawing({ id: 'dock', name: 'Basement dock.pdf', inside: true, floor: -5, crop: { u0: 0, v0: 0, u1: 1000, v1: 600 }, x: -50, y: 30, clearHeight: 4.2 });
  const bus = (id: string, x: number, height = 4, floor?: number): ParkingItem => ({ id, kind: 'vehicle', type: 'bus_eu', label: id, x, y: 0, heading: 90, length: 13.5, width: 2.55, height, ...(floor == null ? {} : { floor }) });

  it('an item on an inside drawing is on its floor; elsewhere, the street; its own floor wins', () => {
    expect(itemFloor(bus('a', 0), [dock])).toBe(-5);
    expect(itemFloor(bus('b', 200), [dock])).toBe(0);
    expect(itemFloor(bus('c', 0, 4, 0), [dock])).toBe(0);
    expect(drawingUnder(bus('a', 0), [dock])?.id).toBe('dock');
    expect(drawingUnder(bus('c', 0, 4, 0), [dock])).toBeNull();
  });

  it('levels are the street plus each inside floor, top first, named after their drawings', () => {
    expect(levelsOf([dock])).toEqual([0, -5]);
    expect(levelsOf([drawing()])).toEqual([0]);
    expect(levelLabel(-5, [dock])).toBe('Basement dock (−5 m)');
    expect(levelLabel(0, [dock])).toBe('Street');
  });

  describe('headroom', () => {
    const limit = (x: number, y: number, o: Partial<MarkerItem> = {}): MarkerItem => ({ id: `m${x}`, kind: 'marker', type: 'height_limit', label: 'Dock door', detail: '', x, y, ...o });

    it('reads the clear height typed, or one written in the detail', () => {
      expect(clearOf(limit(0, 0, { clear: 3.9 }))).toBe(3.9);
      expect(clearOf(limit(0, 0, { detail: 'Max 4,2m' }))).toBe(4.2);
      expect(clearOf({ ...limit(0, 0, { detail: '4.2 m' }), type: 'gate' })).toBeNull();
    });

    it('a vehicle taller than an inside drawing’s clear height is flagged; a shorter one isn’t', () => {
      const w = headroomWarnings([bus('tall', 0, 4.4), bus('ok', 10, 4)], [dock]);
      expect(w.map((x) => x.vehicleIds)).toEqual([['tall']]);
      expect(w[0].text).toContain('4.2 m');
    });

    it('a height limit at the door of an inside drawing guards everything parked on it', () => {
      const door = limit(-52, 0, { clear: 3.8 }); // just outside the west edge
      const w = headroomWarnings([bus('a', 0, 4), bus('street', 300, 4.5), door], [{ ...dock, clearHeight: null }]);
      expect(w.map((x) => x.vehicleIds)).toEqual([['a']]);
      expect(w[0].text).toContain('on the way into');
    });

    it('…one over a parked vehicle flags it; one on a route lists every taller vehicle', () => {
      const canopy = limit(300, 0, { clear: 4.2, label: 'Canopy' });
      const route: ParkingItem = { id: 'r', kind: 'route', label: 'Trucks in', points: [{ x: 500, y: -50 }, { x: 500, y: 50 }] };
      const bridge = limit(500, 0, { clear: 4.0, label: 'Bridge' });
      const w = headroomWarnings([bus('under', 300, 4.4), bus('far', 900, 4.1), canopy, route, bridge], []);
      expect(w.find((x) => x.text.startsWith('Canopy'))?.vehicleIds).toEqual(['under']);
      expect(w.find((x) => x.text.startsWith('Route'))?.vehicleIds).toEqual(['under', 'far']);
    });
  });
});

describe('parseDrawings — the gate into parking_maps.drawings', () => {
  it('keeps a drawing whole, scale to full precision', () => {
    const d = drawing({ scale: 0.084745762711, rotation: 12.3456789, calib: { a: { u: 1, v: 2 }, b: { u: 190, v: 2 }, metres: 16, check: { a: { u: 0, v: 0 }, b: { u: 284, v: 0 }, metres: 24.08 } } });
    const [back] = parseDrawings([d]);
    expect(back.scale).toBe(0.084745762711);
    expect(back.rotation).toBeCloseTo(12.3456789, 9);
    expect(back.calib?.check?.metres).toBe(24.08);
    expect(back).toMatchObject({ fileId: d.fileId, name: d.name, kind: 'pdf', crop: d.crop });
  });

  it('a map without drawings (an old map, or an old client) has none', () => {
    const m = parseMapBody({ anchor: { lat: 52.45, lng: -1.72 }, view: { cx: 0, cy: 0, ppm: 2, rotation: 0 }, notes: '', items: [] });
    expect(m.drawings).toEqual([]);
  });

  it('refuses a drawing without a real file id, with an empty crop, or one too many', () => {
    expect(() => parseDrawings([{ ...drawing(), fileId: '../../etc/passwd' }])).toThrow();
    expect(() => parseDrawings([drawing({ crop: { u0: 10, v0: 10, u1: 10, v1: 300 } })])).toThrow();
    expect(() => parseDrawings(Array.from({ length: LIMITS.drawings + 1 }, (_, i) => drawing({ id: `d${i}` })))).toThrow();
    expect(() => parseDrawings([drawing(), drawing()])).toThrow(); // same id twice
  });

  it('item levels and a limit’s clear height pass the gate; the view keeps satellite off and the level', () => {
    const m = parseMapBody({
      anchor: { lat: 52.45, lng: -1.72 },
      view: { cx: 0, cy: 0, ppm: 2, rotation: 0, satellite: false, level: -5 },
      notes: '',
      items: [
        { id: 'b', kind: 'vehicle', type: 'bus_eu', label: 'Bus 1', x: 0, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4, floor: -5 },
        { id: 'm', kind: 'marker', type: 'height_limit', label: '', detail: '', x: 1, y: 1, clear: 4.2 },
      ],
    });
    expect(m.view).toMatchObject({ satellite: false, level: -5 });
    expect(m.items[0]).toMatchObject({ floor: -5 });
    expect(m.items[1]).toMatchObject({ clear: 4.2 });
  });
});
