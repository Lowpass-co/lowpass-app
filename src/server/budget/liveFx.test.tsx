import { describe, expect, it } from 'vitest';
import { FX_MAX_AGE_MS, staleCurrencies } from './liveFx';

const now = Date.parse('2026-10-18T10:00:00Z');
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

describe('staleCurrencies (live FX, refreshed hourly)', () => {
  it('fetches a used currency with no stored rate', () => {
    expect(staleCurrencies(['EUR', 'GBP'], [], 'GBP', now)).toEqual(['EUR']);
  });
  it('leaves a rate younger than an hour, refetches an older one', () => {
    const stored = [
      { currency: 'EUR', updated_at: minsAgo(20) },
      { currency: 'USD', updated_at: minsAgo(61) },
    ];
    expect(staleCurrencies(['EUR', 'USD'], stored, 'GBP', now)).toEqual(['USD']);
  });
  it('keeps already-stored currencies fresh even if no line uses them now', () => {
    expect(staleCurrencies([], [{ currency: 'cad', updated_at: minsAgo(90) }], 'GBP', now)).toEqual(['CAD']);
  });
  it('never fetches the tour currency, blanks or junk', () => {
    expect(staleCurrencies(['gbp', '', 'EURO', 'jpy'], [], 'GBP', now)).toEqual(['JPY']);
  });
  it('no timestamp counts as stale; force (maxAge −1) refetches everything', () => {
    expect(staleCurrencies([], [{ currency: 'EUR', updated_at: null }], 'GBP', now)).toEqual(['EUR']);
    expect(staleCurrencies(['EUR'], [{ currency: 'EUR', updated_at: minsAgo(1) }], 'GBP', now, -1)).toEqual(['EUR']);
  });
  it('the window is one hour', () => {
    expect(FX_MAX_AGE_MS).toBe(3_600_000);
  });
});
