import { describe, expect, it } from 'vitest';
import { EMPTY, fillBlanks, toBody } from './GearSlideOver';
import type { GearLookup } from '@/lib/gear/lookup';

const found: GearLookup = {
  name: 'AKG C414 XLII', manufacturer: 'AKG', model: 'C414 XLII', category: 'Audio',
  description: 'Multi-pattern condenser.', retail: { amount: 1099, currency: 'USD' },
  weightKg: 0.3, dimensionsCm: { l: 16, w: 5, h: 3.8 }, imageUrl: null, sources: [],
};

describe('look it up fills only the blanks', () => {
  it('a new item takes everything, and a USD retail price starts the purchase cost', () => {
    const d = fillBlanks(EMPTY, found);
    expect(d).toMatchObject({ name: 'AKG C414 XLII', manufacturer: 'AKG', category: 'Audio', valueAmount: 1099, valueCurrency: 'USD', purchaseCost: 1099, weightKg: 0.3, notes: 'Multi-pattern condenser.' });
    expect(d.dims).toEqual({ l: 16, w: 5, h: 3.8 });
  });

  it('never overwrites what you typed', () => {
    const typed = { ...EMPTY, name: 'My 414', purchaseCost: 650, valueAmount: 900, valueCurrency: 'GBP', notes: 'Left capsule' };
    const d = fillBlanks(typed, found);
    expect(d).toMatchObject({ name: 'My 414', purchaseCost: 650, valueAmount: 900, valueCurrency: 'GBP', notes: 'Left capsule', manufacturer: 'AKG' });
  });

  it('a non-USD retail price is the value, not the purchase cost', () => {
    const d = fillBlanks(EMPTY, { ...found, retail: { amount: 899, currency: 'GBP' } });
    expect(d).toMatchObject({ valueAmount: 899, valueCurrency: 'GBP', purchaseCost: null });
  });
});

describe('what gets saved', () => {
  it('a blank day rate means the 3% rule; a typed one is the item’s own', () => {
    expect(toBody({ ...EMPTY, name: 'X', dayRate: null })).toMatchObject({ day_rate: null, day_rate_manual: false });
    expect(toBody({ ...EMPTY, name: 'X', dayRate: 12 })).toMatchObject({ day_rate: 12, day_rate_manual: true });
  });
  it('size is all three or nothing; a value carries its currency', () => {
    expect(toBody({ ...EMPTY, name: 'X', dims: { l: 1, w: null, h: 2 } }).dimensions_cm).toEqual({});
    expect(toBody({ ...EMPTY, name: 'X', valueAmount: null }).value_currency).toBeNull();
    expect(toBody({ ...EMPTY, name: 'X', valueAmount: 5, valueCurrency: 'EUR' }).value_currency).toBe('EUR');
  });
});

import { applyLookup } from './GearSlideOver';
import { lookupDepth, LOOKUP_DEPTHS, missingFacts } from '@/lib/gear/lookup';

describe('Try harder replaces the quick answer, never what you typed', () => {
  const quick: GearLookup = { ...found, name: 'AKG C414', retail: { amount: 999, currency: 'USD' }, weightKg: null, description: 'Mic.' };

  it('quick-filled fields take the better answer; typed ones stay', () => {
    let d = applyLookup(EMPTY, quick, null);
    expect(d).toMatchObject({ name: 'AKG C414', valueAmount: 999, purchaseCost: 999, weightKg: null });
    d = { ...d, purchaseCost: 650 }; // you typed what you paid
    d = applyLookup(d, found, quick);
    expect(d).toMatchObject({ name: 'AKG C414 XLII', valueAmount: 1099, purchaseCost: 650, weightKg: 0.3, notes: 'Multi-pattern condenser.' });
  });

  it('an empty better answer never wipes a quick value', () => {
    const d = applyLookup(applyLookup(EMPTY, quick, null), { ...found, retail: null, description: null }, quick);
    expect(d).toMatchObject({ valueAmount: 999, notes: 'Mic.' });
  });

  it('depths: quick by default (Haiku, 2 searches); thorough is Sonnet', () => {
    expect(lookupDepth(undefined)).toBe('quick');
    expect(lookupDepth('nonsense')).toBe('quick');
    expect(lookupDepth('thorough')).toBe('thorough');
    expect(LOOKUP_DEPTHS.quick).toMatchObject({ model: 'claude-haiku-5-5', maxSearches: 2 });
    expect(LOOKUP_DEPTHS.thorough).toMatchObject({ model: 'claude-sonnet-5-5', maxSearches: 3 });
  });

  it('says what a quick answer left out', () => {
    expect(missingFacts(found)).toEqual(['photo']);
    expect(missingFacts({ ...found, retail: null, weightKg: null, imageUrl: 'https://x/y.jpg' })).toEqual(['price', 'weight']);
  });
});
