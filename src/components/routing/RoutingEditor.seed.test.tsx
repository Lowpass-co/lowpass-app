/* ============================================
   LOWPASS — F-3(b): the ledger paints from the SERVER payload, not a fetch

   The cold-load hang: the routing page already queried `routing` server-side (for
   the fingerprint + status dots), then RoutingEditor discarded that and refetched
   the same rows over /api/tours/[id]/routing before it could render — so the
   ledger sat behind a client round-trip on a cold lambda ("Loading routing…" for
   28-70s).

   Pinned here: given `initialRows`, the editor renders rows IMMEDIATELY and issues
   NO routing fetch on mount. Without a seed it must still fetch (legacy mounts).
   ============================================ */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// RoutingEditor is a client component that expects Next's router context and a
// live realtime subscription. Neither is under test; stub both.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/operations/t1/routing',
}));
vi.mock('@/lib/realtime/useRealtimeRows', () => ({ useRealtimeRows: () => {} }));

import { RoutingEditor } from './RoutingEditor';

function mockFetch() {
  return vi.fn((url: string) => {
    if (String(url).includes('/advance')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ dates: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

const SEED = [
  {
    date: '2026-10-01',
    day_type: 'show',
    city: 'Manchester',
    venue_name: 'O2 Apollo Manchester',
    transport_to_next: 'default',
  },
];

function routingFetchCalls(f: ReturnType<typeof mockFetch>): string[] {
  return f.mock.calls.map((c) => String(c[0])).filter((u) => /\/routing($|\?)/.test(u));
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch());
});

describe('RoutingEditor — server-seeded first paint (F-3b)', () => {
  it('renders the ledger immediately from initialRows and does NOT fetch routing on mount', () => {
    render(
      <RoutingEditor
        tourId="t1"
        startDate="2026-10-01"
        endDate="2026-10-02"
        initialRows={SEED}
      />,
    );

    // Painted — no "Loading routing…" gate.
    expect(screen.queryByText(/loading routing/i)).toBeNull();
    expect(document.querySelectorAll('[data-routing-date]').length).toBe(2);

    // THE ASSERTION: no client round-trip for the payload the server already had.
    expect(routingFetchCalls(fetch as unknown as ReturnType<typeof mockFetch>)).toEqual([]);
  });

  it('still fetches when no seed is provided (legacy mounts keep working)', () => {
    render(<RoutingEditor tourId="t1" startDate="2026-10-01" endDate="2026-10-02" />);
    expect(routingFetchCalls(fetch as unknown as ReturnType<typeof mockFetch>).length).toBeGreaterThan(0);
  });
});
