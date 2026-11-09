import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isCityPlace, venueIsCity } from './notAVenue';
import { FakeDb } from '@/test-utils/fakeSupabase';

describe('venueIsCity', () => {
  it.each([
    ['London', 'London'],
    ['london', 'London'],
    [' London , UK', 'London'],
    ['Zürich', 'Zurich'],
    ['Newcastle  Upon Tyne', 'Newcastle upon Tyne'],
  ])('%j on a day in %j is no venue', (v, c) => expect(venueIsCity(v, c)).toBe(true));

  it.each([
    ['The O2', 'London'],
    ['O2 Academy Brixton', 'London'],
    ['London Palladium', 'London'],
    ['', 'London'],
    ['London', ''],
    [null, null],
  ])('%j in %j is kept', (v, c) => expect(venueIsCity(v, c)).toBe(false));
});

describe('isCityPlace', () => {
  it('a town, region or country is not a venue', () => {
    expect(isCityPlace(['locality', 'political'])).toBe(true);
    expect(isCityPlace(['postal_town', 'political'])).toBe(true);
    expect(isCityPlace(['country', 'political'])).toBe(true);
  });
  it('anything that is an establishment is a venue', () => {
    expect(isCityPlace(['stadium', 'point_of_interest', 'establishment'])).toBe(false);
    expect(isCityPlace(['establishment', 'locality'])).toBe(false);
    expect(isCityPlace(undefined)).toBe(false);
    expect(isCityPlace([])).toBe(false);
  });
});

/* The Schedule's save (PUT) — a city in the venue box never reaches the row,
   and never asks the venue library to make a "venue" called London. */
let db: FakeDb;
const resolved: string[] = [];
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => db.client() }));
vi.mock('@/lib/auth/workspace-check', () => ({ requireWrite: async () => ({ userId: 'user-1' }) }));
vi.mock('@/server/budget/withDerivedRefresh', () => ({
  withDerivedRefresh: (h: unknown) => h,
  tourFromParams: () => null,
}));
vi.mock('@/lib/venues/canonical', () => ({
  resolveCanonicalVenues: async (m: Map<string, { name: string }>) => {
    for (const f of m.values()) resolved.push(f.name);
    return new Map([...m.keys()].map((k) => [k, `cv-${k}`]));
  },
}));
const { POST } = await import('@/app/api/tours/[id]/routing/route');

describe('Schedule save', () => {
  beforeEach(() => {
    resolved.length = 0;
    db = new FakeDb({ unique: { routing: [['tour_id', 'date']] } });
    db.seed('tours', [{ id: 't1', start_date: '2026-11-01', end_date: '2026-11-30' }]);
  });
  it('drops a city typed or picked as the venue, keeps real venues', async () => {
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify([
          { date: '2026-11-05', day_type: 'off', city: 'London', venue_name: 'London', place_id: 'pl-london', venue_phone: '+44' },
          { date: '2026-11-20', day_type: 'show', city: 'London', venue_name: 'The O2', place_id: 'pl-o2' },
        ]),
      }),
      { params: Promise.resolve({ id: 't1' }) },
    );
    expect(res.status).toBeLessThan(300);
    const rows = db.t('routing');
    const off = rows.find((r) => r.date === '2026-11-05')!;
    const show = rows.find((r) => r.date === '2026-11-20')!;
    expect([off.venue_name, off.venue_phone, off.canonical_venue_id, off.city]).toEqual([null, null, null, 'London']);
    expect([show.venue_name, show.canonical_venue_id]).toEqual(['The O2', 'cv-pl-o2']);
    expect(resolved).toEqual(['The O2']);
  });
});
