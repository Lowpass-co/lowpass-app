/* Flight search (Nov 2026) — the rules that keep the 100 calls a month. */
import { describe, expect, it, vi } from 'vitest';
import { aviationstackError, cacheFresh, inPlanWindow, normaliseFlightNumber, parseAviationstack } from './lookup';
import { lookupConfig, lookupFlight } from '@/server/flights/lookup';

describe('normaliseFlightNumber', () => {
  it('tidies what people type', () => {
    expect(normaliseFlightNumber('ba 117')).toBe('BA117');
    expect(normaliseFlightNumber('BA-0117')).toBe('BA117');
    expect(normaliseFlightNumber('u2 8021')).toBe('U28021');
    expect(normaliseFlightNumber('9W 120')).toBe('9W120');
  });
  it('refuses what isn’t a flight number (nothing is sent)', () => {
    expect(normaliseFlightNumber('')).toBeNull();
    expect(normaliseFlightNumber('117')).toBeNull();
    expect(normaliseFlightNumber('12 345')).toBeNull();
    expect(normaliseFlightNumber('British Airways')).toBeNull();
  });
});

describe('inPlanWindow', () => {
  it('free: only around today', () => {
    expect(inPlanWindow('free', '2026-11-26', '2026-11-26')).toBe(true);
    expect(inPlanWindow('free', '2026-11-27', '2026-11-26')).toBe(true);
    expect(inPlanWindow('free', '2026-12-10', '2026-11-26')).toBe(false);
  });
  it('a paid plan: any date', () => {
    expect(inPlanWindow('basic', '2027-03-01', '2026-11-26')).toBe(true);
  });
});

describe('cacheFresh', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  it('a found flight for 6 h; a flown flight for good', () => {
    expect(cacheFresh({ status: 'ok', created_at: at(5), flight_date: '2026-11-26' }, now)).toBe(true);
    expect(cacheFresh({ status: 'ok', created_at: at(7), flight_date: '2026-11-26' }, now)).toBe(false);
    expect(cacheFresh({ status: 'ok', created_at: at(500), flight_date: '2026-11-01' }, now)).toBe(true);
  });
  it('a miss for 3 h; an error never', () => {
    expect(cacheFresh({ status: 'not_found', created_at: at(2), flight_date: '2026-11-26' }, now)).toBe(true);
    expect(cacheFresh({ status: 'not_found', created_at: at(4), flight_date: '2026-11-26' }, now)).toBe(false);
    expect(cacheFresh({ status: 'error', created_at: at(0.1), flight_date: '2026-11-26' }, now)).toBe(false);
  });
});

const SAMPLE = {
  pagination: { count: 2 },
  data: [
    { flight_date: '2026-11-26', flight_status: 'scheduled', airline: { name: 'American Airlines' },
      flight: { iata: 'BA117', number: '117', codeshared: { airline_iata: 'ba' } },
      departure: { iata: 'LHR', airport: 'Heathrow', scheduled: '2026-11-26T11:25:00+00:00' },
      arrival: { iata: 'JFK', airport: 'JFK', scheduled: '2026-11-26T14:25:00+00:00' } },
    { flight_date: '2026-11-26', flight_status: 'scheduled', airline: { name: 'British Airways' },
      flight: { iata: 'BA117', number: '117', codeshared: null },
      departure: { iata: 'LHR', airport: 'Heathrow', terminal: '5', gate: 'B32', scheduled: '2026-11-26T11:25:00+00:00' },
      arrival: { iata: 'JFK', airport: 'John F Kennedy International', scheduled: '2026-11-26T14:25:00+00:00' } },
  ],
};

describe('parseAviationstack', () => {
  it('the operating flight on that date, local clock kept', () => {
    expect(parseAviationstack(SAMPLE, 'BA117', '2026-11-26')).toMatchObject({
      airline: 'British Airways', from: 'LHR', to: 'JFK', departLocal: '2026-11-26T11:25', arriveLocal: '2026-11-26T14:25', terminal: '5', gate: 'B32',
    });
  });
  it('another date → nothing', () => {
    expect(parseAviationstack(SAMPLE, 'BA117', '2026-11-27')).toBeNull();
    expect(parseAviationstack({ data: [] }, 'BA117', '2026-11-26')).toBeNull();
    expect(parseAviationstack(null, 'BA117', '2026-11-26')).toBeNull();
  });
  it('provider errors read as sentences', () => {
    expect(aviationstackError({ error: { code: 'usage_limit_reached' } })?.fatal).toBe(true);
    expect(aviationstackError({ error: { code: 'https_access_restricted' } })?.message).toMatch(/HTTPS/);
    expect(aviationstackError(SAMPLE)).toBeNull();
  });
});

/* ---- the server path: cache → window → reserve → ONE call ---- */
function fakeDb(opts: { cached?: Record<string, unknown> | null; reserve?: string | null } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const rpc = vi.fn(async () => ({ data: opts.reserve === undefined ? 'row-1' : opts.reserve, error: null }));
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, order: () => q,
    limit: async () => ({ data: opts.cached ? [opts.cached] : [], error: null }),
    update: (u: Record<string, unknown>) => { updates.push(u); return { eq: async () => ({ error: null }) }; },
  });
  return { db: { from: () => q, rpc } as never, rpc, updates };
}
const cfg = (over: Partial<ReturnType<typeof lookupConfig>> = {}) => ({ ...lookupConfig({ AVIATIONSTACK_KEY: 'k' }), ...over });
const now = new Date('2026-11-26T09:00:00Z');
const Q = { flightIata: 'BA117', flightDate: '2026-11-26', workspaceId: 'ws', userId: 'u' };

describe('lookupFlight', () => {
  it('one call, stored, filled in', async () => {
    const { db, updates, rpc } = fakeDb();
    const f = vi.fn(async () => new Response(JSON.stringify(SAMPLE)));
    const r = await lookupFlight(db, cfg(), Q, { fetch: f as never, now });
    expect(r).toMatchObject({ ok: true, cached: false, flight: { from: 'LHR' } });
    expect(f).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({ status: 'ok' });
    // free plan: no date filter sent (the plan can't take one)
    expect(String((f.mock.calls[0] as unknown[])[0])).not.toContain('flight_date');
  });
  it('a paid plan sends the date', async () => {
    const { db } = fakeDb();
    const f = vi.fn(async () => new Response(JSON.stringify(SAMPLE)));
    await lookupFlight(db, cfg({ plan: 'basic' }), Q, { fetch: f as never, now });
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('flight_date=2026-11-26');
  });
  it('a fresh cached answer costs nothing', async () => {
    const { db, rpc } = fakeDb({ cached: { status: 'ok', created_at: '2026-11-26T08:00:00Z', flight_date: '2026-11-26', result: { from: 'LHR' } } });
    const f = vi.fn();
    expect(await lookupFlight(db, cfg(), Q, { fetch: f as never, now })).toMatchObject({ ok: true, cached: true });
    expect(f).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('a date the free plan can’t answer costs nothing', async () => {
    const { db, rpc } = fakeDb();
    const f = vi.fn();
    const r = await lookupFlight(db, cfg(), { ...Q, flightDate: '2026-12-20' }, { fetch: f as never, now });
    expect(r).toMatchObject({ ok: false, code: 'OUT_OF_RANGE' });
    expect(f).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('the month used up → no call', async () => {
    const { db } = fakeDb({ reserve: null });
    const f = vi.fn();
    expect(await lookupFlight(db, cfg(), Q, { fetch: f as never, now })).toMatchObject({ ok: false, code: 'CAP_REACHED' });
    expect(f).not.toHaveBeenCalled();
  });
  it('no key → no call', async () => {
    const { db, rpc } = fakeDb();
    const f = vi.fn();
    expect(await lookupFlight(db, { ...cfg(), key: null }, Q, { fetch: f as never, now })).toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(f).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('the cap defaults leave room under the free 100', () => {
    const c = lookupConfig({});
    expect(c.monthlyCap).toBeLessThan(100);
    expect(c.workspaceCap).toBeLessThanOrEqual(c.monthlyCap);
    expect(c.base.startsWith('https://')).toBe(true);
  });
});
