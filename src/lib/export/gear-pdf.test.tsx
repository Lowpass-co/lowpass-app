/* ============================================
   LOWPASS — gear manifest + carnet body rendering (R3-4)

   This file had NO test at all, which is how R3-1 shipped: the dagger/legend
   conditional is the thing that makes the disclosure honest, and nothing
   exercised it.

   These assert the rendered HTML, not the predicate — the predicate is covered
   in carnet-completeness.test.tsx. What matters here is that the DOCUMENT never
   prints a symbol it cannot justify, and never prints a total it cannot defend.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { buildCarnetBodyHtml, buildGearManifestBodyHtml, CARNET_DISCLAIMER } from './gear-pdf';
import type { GearExportData, GearExportItem } from './gear-data';

const item = (over: Partial<GearExportItem> = {}): GearExportItem => ({
  id: 'g1',
  name: 'AKG 414',
  manufacturer: 'AKG',
  model: '414',
  serial_number: 'SN1',
  country_of_origin: 'AU',
  customs_hs_code: '8518.10',
  weight_kg: 0.3,
  value_amount: null,
  purchase_cost: 300,
  value_currency: 'GBP',
  dimensions_cm: null,
  space_id: null,
  container_id: null,
  ...over,
});

const data = (items: GearExportItem[]): GearExportData => ({
  items,
  groups: [
    {
      spaceName: 'Unplaced',
      containers: [{ containerName: 'Loose items', items, weightKg: 0 }],
      weightKg: 0,
    },
  ],
  totalWeightKg: 0,
  scopeLabel: 'All gear',
  logoUrl: null,
  artistName: null,
});

describe('carnet — the symbol is never borrowed from another column', () => {
  it('THE REGRESSION: a purchase-cost fallback prints NO currency symbol', () => {
    /* value_currency is 'GBP' on this row. The figure came from purchase_cost,
       which has no currency column, so "GBP 300.00" would be R2-6 again. */
    const html = buildCarnetBodyHtml(data([item()]));
    expect(html).toContain('300.00');
    expect(html).not.toContain('GBP 300.00');
  });

  it('a declared value DOES print its declared currency', () => {
    const html = buildCarnetBodyHtml(data([item({ value_amount: 500, value_currency: 'USD' })]));
    expect(html).toContain('USD 500.00');
  });

  it('the dagger legend appears only when a fallback was used', () => {
    const withFallback = buildCarnetBodyHtml(data([item()]));
    expect(withFallback).toContain('<sup>†</sup>');
    /* The template literal wraps, so compare on normalised whitespace rather
       than guessing where the line breaks fall. */
    const flat = withFallback.replace(/\s+/g, ' ');
    expect(flat).toContain('its currency is not recorded');
    expect(flat).toContain('no symbol is shown');

    const noFallback = buildCarnetBodyHtml(data([item({ value_amount: 500 })]));
    /* A legend for a mark that is not on the page is noise. */
    expect(noFallback).not.toContain('purchase cost, not a declared');
  });
});

describe('carnet — totals refuse rather than guess', () => {
  it('MIXED UNITS: no single total, per-currency subtotals instead', () => {
    const html = buildCarnetBodyHtml(
      data([
        item({ id: 'a', value_amount: 100, value_currency: 'GBP' }),
        item({ id: 'b', value_amount: 50, value_currency: 'USD' }),
      ]),
    );
    expect(html).toContain('Not summable across');
    expect(html).toContain('GBP 100.00');
    expect(html).toContain('USD 50.00');
    /* The bare sum that would have been printed before. */
    expect(html).not.toContain('>150.00<');
  });

  it('an unknown-unit row poisons an otherwise single-currency total', () => {
    const html = buildCarnetBodyHtml(
      data([item({ id: 'a', value_amount: 100, value_currency: 'GBP' }), item({ id: 'b' })]),
    );
    expect(html).toContain('Not summable across');
    expect(html).toContain('unrecorded currency');
  });

  it('one known currency and no fallbacks DOES total', () => {
    const html = buildCarnetBodyHtml(
      data([
        item({ id: 'a', value_amount: 100, value_currency: 'GBP' }),
        item({ id: 'b', value_amount: 50, value_currency: 'GBP' }),
      ]),
    );
    expect(html).toContain('GBP 150.00');
    expect(html).not.toContain('Not summable');
  });
});

describe('carnet — the liability wording travels on the document', () => {
  it('states it is the general list and NOT a carnet', () => {
    const html = buildCarnetBodyHtml(data([item()]));
    expect(html).toContain(CARNET_DISCLAIMER);
    expect(CARNET_DISCLAIMER).toContain('not a carnet');
    expect(CARNET_DISCLAIMER).toContain('chamber of commerce');
  });

  it('the disclaimer survives an empty scope, where it matters just as much', () => {
    expect(buildCarnetBodyHtml(data([]))).toContain(CARNET_DISCLAIMER);
  });

  it('gaps are marked visibly, never left blank', () => {
    const html = buildCarnetBodyHtml(data([item({ customs_hs_code: null })]));
    expect(html).toContain('— MISSING —');
    expect(html).toContain('incomplete');
  });
});

describe('manifest — parity with the carnet (R3-2)', () => {
  it('THE REGRESSION: the value column is populated, not empty', () => {
    /* It read raw value_amount, so every production row rendered blank while
       the carnet showed a figure for the same item. */
    const html = buildGearManifestBodyHtml(data([item()]));
    expect(html).toContain('300.00');
  });

  it('and it obeys the SAME currency rule — no borrowed symbol', () => {
    const html = buildGearManifestBodyHtml(data([item()]));
    expect(html).not.toContain('GBP 300.00');
    expect(html).toContain('<sup>†</sup>');
  });

  it('a declared value prints its currency here too', () => {
    const html = buildGearManifestBodyHtml(data([item({ value_amount: 500, value_currency: 'USD' })]));
    expect(html).toContain('USD 500.00');
  });

  it('an item with no value at all renders an empty cell, not NaN or 0.00', () => {
    const html = buildGearManifestBodyHtml(data([item({ value_amount: null, purchase_cost: null })]));
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('0.00 <sup>†</sup>');
  });
});
