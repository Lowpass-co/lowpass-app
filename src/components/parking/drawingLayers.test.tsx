import { describe, expect, it } from 'vitest';
import { sceneDrawings, type DrawingRaster } from './drawingLayers';
import type { ParkingDrawing } from '@/lib/parking/model';

const d = (o: Partial<ParkingDrawing>): ParkingDrawing => ({
  id: 'o2', fileId: '00000000-0000-4000-8000-000000000001', name: 'O2 yard.pdf', kind: 'pdf', page: 1, srcW: 1000, srcH: 800,
  crop: { u0: 0, v0: 0, u1: 1000, v1: 800 }, scale: 0.1, calib: null, x: 0, y: 0, rotation: 0, pinned: true, pinCheck: 1,
  opacity: 0.85, hidden: false, inside: false, floor: 0, clearHeight: null, insideArea: null, ...o,
});
const r = { key: 'k', lightUrl: 'light', darkUrl: 'clear' } as unknown as DrawingRaster;
const rasters = new Map([['o2', r]]);

describe('the plan: inside drawings are a floor only where they are inside', () => {
  it('an outside drawing is lines on the satellite, as before', () => {
    const [s] = sceneDrawings([d({})], rasters, true, undefined, 'FLOOR');
    expect(s).toMatchObject({ href: 'light', blend: 'multiply' });
    expect(s.inside).toBeUndefined();
  });
  it('an inside drawing with no outline: the whole sheet is floor', () => {
    const [s] = sceneDrawings([d({ inside: true })], rasters, true, undefined, 'FLOOR');
    expect(s.inside).toEqual({ points: [{ u: 0, v: 0 }, { u: 1000, v: 0 }, { u: 1000, v: 800 }, { u: 0, v: 800 }], fill: 'FLOOR', href: 'clear' });
  });
  it('with an outline: floor inside it; the rest of the sheet stays lines on the satellite', () => {
    const area = [{ u: 300, v: 0 }, { u: 1000, v: 0 }, { u: 1000, v: 800 }, { u: 300, v: 800 }];
    const [s] = sceneDrawings([d({ inside: true, insideArea: area })], rasters, true, undefined, 'FLOOR');
    expect(s).toMatchObject({ href: 'light', blend: 'multiply' });
    expect(s.inside?.points).toEqual(area);
  });
  it('satellite off: the outside part is clear lines on the dark map', () => {
    const [s] = sceneDrawings([d({ inside: true })], rasters, false, undefined, 'FLOOR');
    expect(s).toMatchObject({ href: 'clear', blend: 'normal' });
  });
});
