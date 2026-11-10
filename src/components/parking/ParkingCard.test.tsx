/* The Parking card on a show's advance. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParkingCard } from './ParkingCard';
import { summariseMap } from '@/lib/parking/summary';
import type { ParkingItem } from '@/lib/parking/model';

const bus = (id: string): ParkingItem => ({ id, kind: 'vehicle', type: 'bus_eu', label: id, x: 0, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4 });

afterEach(() => vi.unstubAllGlobals());

describe('ParkingCard', () => {
  it('no map yet: invites drawing one, links to the editor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ show: {}, map: null }), { status: 200 })));
    render(<ParkingCard tourId="t1" routingId="r1" index={3} />);
    const link = await screen.findByRole('link', { name: /Draw the parking map/ });
    expect(link.getAttribute('href')).toBe('/advance/t1/r1/parking');
  });

  it('a saved map: says what is on it', async () => {
    const map = { id: 'm', version: 2, updatedAt: '', anchor: { lat: 0, lng: 0 }, view: {}, notes: '', pdf: null, items: [bus('a'), bus('b'), { id: 'p', kind: 'marker', type: 'shore_power', label: '', detail: '', x: 0, y: 0 }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ map }), { status: 200 })));
    render(<ParkingCard tourId="t1" routingId="r1" index={3} />);
    expect(await screen.findByText('2 buses · 1 marker')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open parking map/ })).toBeTruthy();
  });
});

describe('summariseMap', () => {
  it('counts by kind, plural-aware; empty → null', () => {
    expect(summariseMap([])).toBeNull();
    expect(summariseMap([bus('a')])).toBe('1 bus');
    expect(
      summariseMap([
        bus('a'),
        { id: 't', kind: 'vehicle', type: 'truck_eu', label: '', x: 0, y: 0, heading: 0, length: 16.5, width: 2.55, height: 4 },
        { id: 'r', kind: 'route', label: '', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      ]),
    ).toBe('1 bus · 1 truck · 1 route');
  });
});
