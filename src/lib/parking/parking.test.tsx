/* Parking maps — the rules that make a bus true size (Nov 2026, Adam). */

import { describe, expect, it } from 'vitest';
import {
  bearing,
  dist,
  lngLatToTile,
  metresPerTilePixel,
  niceLength,
  printScaleFor,
  project,
  tileRect,
  tileZoomFor,
  toLatLng,
  toLocal,
  unproject,
  visibleTiles,
  zoomAt,
  type View,
} from './geo';
import { LIMITS, ParkingInputError, nextLabel, parseItem, parseMapBody, pathLength, vehicleCorners, type ParkingItem } from './model';

// First Direct Arena, Leeds — the acceptance venue.
const LEEDS = { lat: 53.8027, lng: -1.5446 };

/** Great-circle distance (haversine) — an independent ruler for the frame. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe('the ground frame is true size', () => {
  it('round-trips lat/lng ↔ metres', () => {
    const p = { lat: 53.8051, lng: -1.5401 };
    const back = toLatLng(LEEDS, toLocal(LEEDS, p));
    expect(back.lat).toBeCloseTo(p.lat, 10);
    expect(back.lng).toBeCloseTo(p.lng, 10);
  });

  it('distances within 1 km agree with the haversine ruler to 0.5 % (5 mm on a 1 m object)', () => {
    for (const p of [
      { lat: 53.8027, lng: -1.5296 }, // ~1 km east
      { lat: 53.8117, lng: -1.5446 }, // ~1 km north
      { lat: 53.8091, lng: -1.5352 }, // diagonal
      { lat: 53.80285, lng: -1.5444 }, // ~20 m — bus scale
    ]) {
      const frame = dist({ x: 0, y: 0 }, toLocal(LEEDS, p));
      expect(Math.abs(frame - haversine(LEEDS, p)) / haversine(LEEDS, p)).toBeLessThan(0.005);
    }
  });

  it('bearing: north 0, east 90', () => {
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0);
    expect(bearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(bearing({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
  });
});

describe('the view', () => {
  const v: View = { cx: 10, cy: -5, ppm: 3, rotation: 37 };

  it('project and unproject are inverses at any rotation', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 40, y: 12 }, { x: -7, y: 99 }]) {
      const back = unproject(v, 800, 600, project(v, 800, 600, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('north up: north is up the screen; east up: north is to the left', () => {
    const n: View = { cx: 0, cy: 0, ppm: 1, rotation: 0 };
    expect(project(n, 100, 100, { x: 0, y: 10 })).toEqual({ x: 50, y: 40 });
    const e: View = { ...n, rotation: 90 };
    const s = project(e, 100, 100, { x: 0, y: 10 });
    expect(s.x).toBeCloseTo(40);
    expect(s.y).toBeCloseTo(50);
  });

  it('a 13.7 m bus is 13.7 × ppm pixels long on screen, whatever the rotation', () => {
    const bus = { x: 5, y: 5, heading: 63, length: 13.7, width: 2.55 };
    const [fl, , , rl] = vehicleCorners(bus);
    const a = project(v, 800, 600, fl);
    const b = project(v, 800, 600, rl);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(13.7 * v.ppm, 6);
  });

  it('zooming keeps the ground under the cursor still', () => {
    const cursor = { x: 620, y: 140 };
    const before = unproject(v, 800, 600, cursor);
    const after = unproject(zoomAt(v, 800, 600, cursor, 2.5), 800, 600, cursor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });
});

describe('tiles sit where the ground is', () => {
  it('a tile is as wide on the ground as Web Mercator says', () => {
    const z = 19;
    const t = lngLatToTile(LEEDS, z);
    const r = tileRect(LEEDS, { z, x: Math.floor(t.x), y: Math.floor(t.y) });
    expect(r.w / (metresPerTilePixel(LEEDS.lat, z) * 256)).toBeCloseTo(1, 3);
    expect(r.h / r.w).toBeCloseTo(1, 2); // square at this scale
  });

  it('the anchor lands inside the tile that contains it', () => {
    const z = 18;
    const t = lngLatToTile(LEEDS, z);
    const r = tileRect(LEEDS, { z, x: Math.floor(t.x), y: Math.floor(t.y) });
    expect(r.x).toBeLessThanOrEqual(0);
    expect(r.x + r.w).toBeGreaterThan(0);
    expect(r.y).toBeLessThanOrEqual(0);
    expect(r.y + r.h).toBeGreaterThan(0);
  });

  it('adjacent tiles share an edge exactly (no seams from the maths)', () => {
    const a = tileRect(LEEDS, { z: 19, x: 259000, y: 168000 });
    const b = tileRect(LEEDS, { z: 19, x: 259001, y: 168000 });
    expect(a.x + a.w).toBeCloseTo(b.x, 9);
  });

  it('zoom choice: denser screens and closer views ask for deeper tiles, capped at the imagery limit', () => {
    const z1 = tileZoomFor(LEEDS.lat, 2, 1, 2, 22);
    expect(tileZoomFor(LEEDS.lat, 4, 1, 2, 22)).toBe(z1 + 1);
    expect(tileZoomFor(LEEDS.lat, 2, 2, 2, 22)).toBe(z1 + 1);
    expect(tileZoomFor(LEEDS.lat, 40, 2, 1, 19)).toBe(19);
    // The chosen tiles are at least as sharp as the screen.
    expect(1 / (metresPerTilePixel(LEEDS.lat, z1) / 2)).toBeGreaterThanOrEqual(2);
  });

  it('a rotated viewport still gets every tile under it, nearest first, capped', () => {
    const v: View = { cx: 0, cy: 0, ppm: 2, rotation: 45 };
    const z = tileZoomFor(LEEDS.lat, v.ppm, 1, 2, 22);
    const tiles = visibleTiles(LEEDS, v, 1200, 800, z);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(120);
    const c = lngLatToTile(LEEDS, z);
    expect(tiles[0]).toEqual({ z, x: Math.floor(c.x), y: Math.floor(c.y) });
    // Every screen corner's tile is in the set.
    for (const s of [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 800 }, { x: 0, y: 800 }]) {
      const t = lngLatToTile(toLatLng(LEEDS, unproject(v, 1200, 800, s)), z);
      expect(tiles.some((k) => k.x === Math.floor(t.x) && k.y === Math.floor(t.y))).toBe(true);
    }
  });
});

describe('scale on paper', () => {
  it('scale-bar lengths are round', () => {
    expect(niceLength(73)).toBe(50);
    expect(niceLength(19)).toBe(10);
    expect(niceLength(240)).toBe(200);
    expect(niceLength(0)).toBe(0);
  });

  it('the print scale is the most detailed one that fits', () => {
    // 120 m across 250 mm of paper needs 1:480 → 1:500.
    expect(printScaleFor(120, 250)).toBe(500);
    expect(printScaleFor(50, 250)).toBe(200);
    expect(printScaleFor(4000, 250)).toBe(10000);
  });
});

describe('parseMapBody — the only way into parking_maps.items', () => {
  const ok = {
    anchor: LEEDS,
    view: { cx: 0, cy: 0, ppm: 2, rotation: 0 },
    notes: '  Buses arrive after 08:00  ',
    items: [
      { id: 'b1', kind: 'vehicle', type: 'bus_eu', label: 'Bus 1 — band', x: 3, y: 4, heading: 370, length: 13.5, width: 2.55, height: 4, extra: 'dropped' },
      { id: 'm1', kind: 'marker', type: 'shore_power', label: '', detail: '63 A three-phase', x: 1, y: 1 },
      { id: 'r1', kind: 'route', label: 'Approach', points: [{ x: 0, y: 0 }, { x: 30, y: 40 }] },
      { id: 'a1', kind: 'area', type: 'crew', label: '', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
      { id: 'd1', kind: 'measure', a: { x: 0, y: 0 }, b: { x: 3, y: 4 } },
    ],
  };

  it('accepts a good map, trims text, normalises headings, drops unknown fields', () => {
    const m = parseMapBody(ok);
    expect(m.notes).toBe('Buses arrive after 08:00');
    const bus = m.items[0] as Extract<ParkingItem, { kind: 'vehicle' }>;
    expect(bus.heading).toBe(10);
    expect('extra' in bus).toBe(false);
    expect(m.items).toHaveLength(5);
  });

  const bad: [string, (b: typeof ok) => unknown][] = [
    ['unknown vehicle type', (b) => ({ ...b, items: [{ ...b.items[0], type: 'spaceship' }] })],
    ['a 90 m bus', (b) => ({ ...b, items: [{ ...b.items[0], length: 90 }] })],
    ['NaN position', (b) => ({ ...b, items: [{ ...b.items[0], x: Number.NaN }] })],
    ['a string for a number', (b) => ({ ...b, items: [{ ...b.items[0], x: '3' }] })],
    ['something 50 km away', (b) => ({ ...b, items: [{ ...b.items[1], x: 50000 }] })],
    ['a one-point route', (b) => ({ ...b, items: [{ ...b.items[2], points: [{ x: 0, y: 0 }] }] })],
    ['a two-point area', (b) => ({ ...b, items: [{ ...b.items[3], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] })],
    ['an odd id', (b) => ({ ...b, items: [{ ...b.items[0], id: '<script>' }] })],
    ['two items with one id', (b) => ({ ...b, items: [b.items[0], b.items[0]] })],
    ['too many items', (b) => ({ ...b, items: Array.from({ length: LIMITS.items + 1 }, (_, i) => ({ ...b.items[1], id: `m${i}` })) })],
    ['an unknown kind', (b) => ({ ...b, items: [{ id: 'x', kind: 'tank' }] })],
    ['an anchor off the planet', (b) => ({ ...b, anchor: { lat: 95, lng: 0 } })],
    ['items not a list', (b) => ({ ...b, items: {} })],
  ];
  it.each(bad)('refuses %s', (_name, make) => {
    expect(() => parseMapBody(make(ok))).toThrow(ParkingInputError);
  });

  it('caps long text instead of refusing it', () => {
    const m = parseItem({ id: 'm', kind: 'marker', type: 'note', label: 'x'.repeat(500), detail: '', x: 0, y: 0 });
    expect(m.kind === 'marker' && m.label.length).toBe(LIMITS.label);
  });
});

describe('vehicle helpers', () => {
  it('corners: heading 0 faces north; 90 faces east', () => {
    const north = vehicleCorners({ x: 0, y: 0, heading: 0, length: 10, width: 2 });
    expect(north[0].x).toBeCloseTo(-1);
    expect(north[0].y).toBeCloseTo(5); // front-left is north-west
    const east = vehicleCorners({ x: 0, y: 0, heading: 90, length: 10, width: 2 });
    expect(east[0].x).toBeCloseTo(5);
    expect(east[0].y).toBeCloseTo(1); // front-left is north-east
  });

  it('next label skips numbers in use', () => {
    const items = [
      { id: 'a', kind: 'vehicle', type: 'bus_eu', label: 'Bus 1', x: 0, y: 0, heading: 0, length: 1, width: 1, height: 1 },
      { id: 'b', kind: 'vehicle', type: 'bus_eu', label: 'Bus 3', x: 0, y: 0, heading: 0, length: 1, width: 1, height: 1 },
    ] as ParkingItem[];
    expect(nextLabel(items, 'Bus')).toBe('Bus 2');
    expect(nextLabel(items, 'Truck')).toBe('Truck 1');
  });

  it('path length', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });
});

describe('the anchor survives a save (Adam, Nov 2026: icons moved on reload)', () => {
  // Positive assertion: the pin that comes back is the pin that was sent, to
  // a centimetre. The old parse rounded degrees to 0.001 (~111 m N–S), so the
  // whole drawing jumped against the imagery on every reload.
  const send = (lat: number, lng: number) =>
    parseMapBody({ anchor: { lat, lng }, view: { cx: 0, cy: 0, ppm: 2, rotation: 0 }, notes: '', items: [] }).anchor;
  it('round-trips First Direct Arena-ish coordinates to under 1 cm', () => {
    for (const [lat, lng] of [[53.8027123, -1.5446789], [36.1593456, -86.7785123], [-33.8567844, 151.2152967], [0.0004999, -0.0004999]]) {
      const back = send(lat, lng);
      const off = toLocal({ lat, lng }, back);
      expect(Math.hypot(off.x, off.y)).toBeLessThan(0.01);
    }
  });
  it('still refuses nonsense', () => {
    expect(() => send(91, 0)).toThrow();
    expect(() => send(Number.NaN, 0)).toThrow();
  });
});
