/* Production › Parking — the tour's shows and their maps. */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/operations/t1/parking', useSearchParams: () => new URLSearchParams() }));

import { ParkingIndex } from './ParkingIndex';

describe('ParkingIndex', () => {
  it('lists each show with its map, and a row opens that show’s map', () => {
    render(
      <ParkingIndex
        tourId="t1"
        rows={[
          { routingId: 'r1', date: '2026-12-01', dayType: 'show', venue: 'First Direct Arena', city: 'Leeds', summary: '2 buses · 1 truck', hasMap: true, updatedAt: null, pdfExportedAt: '2026-11-10T12:00:00Z' },
          { routingId: 'r2', date: '2026-12-02', dayType: 'show', venue: 'Barrowland', city: 'Glasgow', summary: null, hasMap: false, updatedAt: null, pdfExportedAt: null },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Parking' })).toBeTruthy();
    expect(screen.getByText('2 buses · 1 truck')).toBeTruthy();
    expect(screen.getByText('Not drawn')).toBeTruthy();
    expect(screen.getByText(/1 of 2 drawn/)).toBeTruthy();
    fireEvent.click(screen.getByText('Barrowland'));
    expect(push).toHaveBeenCalledWith('/operations/t1/parking/r2');
  });
});
