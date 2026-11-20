/**
 * The red "keep clear" box behind ramps, tail lifts and van doors (Nov 2026,
 * Adam: "a hashed red box behind for the correct drop distance … Trucks don't
 * need cause their doors usually open flush").
 */
import { describe, expect, it } from 'vitest';
import { VEHICLES, vehicleSpec } from './catalogue';
import { parseItem, rearClearCorners, rearClearance, type VehicleItem } from './model';
import { itemPoints } from './print';

const van = (over: Partial<VehicleItem> = {}): VehicleItem => ({
  id: 'v1', kind: 'vehicle', type: 'sprinter', label: 'Van 1', x: 0, y: 0, heading: 0, length: 7.4, width: 2.02, height: 2.8, ...over,
});

describe('which vehicles get one', () => {
  it('bus trailers, the Bandwagon trailer and vans; never a truck or a lone tractor/trailer', () => {
    const has = VEHICLES.filter((v) => v.rear).map((v) => v.type).sort();
    expect(has).toEqual(['bandwagon_trailer', 'bus_eu_trailer', 'bus_us_trailer', 'luton', 'splitter', 'sprinter', 'vito']);
    for (const t of ['truck_eu', 'truck_us', 'box_us', 'tractor_eu', 'trailer_eu']) expect(vehicleSpec(t)?.rear).toBeUndefined();
  });
  it('BandWagon: 66 ft kerb for a 59 ft rig → 7 ft ≈ 2.1 m', () => {
    expect(vehicleSpec('bandwagon_trailer')!.rear!.length).toBeCloseTo(((66 - 59) * 0.3048), 1);
  });
});

describe('the box', () => {
  it('sits behind the tail, as wide as the vehicle, as deep as the drop', () => {
    // Heading 0 = nose north; the tail is at y = -3.7, the box runs to -4.5.
    const c = rearClearCorners(van())!;
    const ys = c.map((p) => p.y);
    const xs = c.map((p) => p.x);
    expect(Math.max(...ys)).toBeCloseTo(-3.7);
    expect(Math.min(...ys)).toBeCloseTo(-4.5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2.02);
  });
  it('turns with the vehicle (heading 90 = nose east → box to the west)', () => {
    const c = rearClearCorners(van({ heading: 90 }))!;
    expect(Math.max(...c.map((p) => p.x))).toBeCloseTo(-3.7);
    expect(Math.min(...c.map((p) => p.x))).toBeCloseTo(-4.5);
  });
  it('is off when turned off, and none for a truck', () => {
    expect(rearClearCorners(van({ rearClear: false }))).toBeNull();
    expect(rearClearance(van({ type: 'truck_eu' }))).toBeNull();
  });
  it('a fit PDF page frames it', () => {
    const pts = itemPoints([van()]);
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(-4.5);
  });
});

describe('saved', () => {
  it('keeps an explicit off, drops anything that is not a boolean', () => {
    expect((parseItem({ ...van(), rearClear: false }) as VehicleItem).rearClear).toBe(false);
    expect('rearClear' in parseItem({ ...van(), rearClear: 'no' })).toBe(false);
    expect('rearClear' in parseItem(van())).toBe(false);
  });
});
