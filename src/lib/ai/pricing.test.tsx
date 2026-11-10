/* AI pricing — every model an endpoint calls must have a price, or the call
   is recorded at $0 and slips past the workspace budget (the cap sums cost). */

import { describe, expect, it } from 'vitest';
import { computeCostMicros, resolvePricing } from './pricing';
import { DRAWING_READ_MODEL } from '@/lib/parking/drawingRead';

describe('AI pricing', () => {
  it('the 5.5 models are priced (pricing page, 2026-11-11)', () => {
    expect(resolvePricing('claude-sonnet-5-5')).toMatchObject({ input: 2, output: 10 });
    expect(resolvePricing('claude-opus-5-5')).toMatchObject({ input: 4, output: 20 });
    expect(resolvePricing('claude-haiku-5-5')).toMatchObject({ input: 0.1, output: 0.5 });
  });

  it('a venue-drawing read costs a few cents, not 0', () => {
    // ~4.8k image tokens + ~1k prompt in, ~800 out — one overview call.
    const { micros, priced } = computeCostMicros(DRAWING_READ_MODEL, { input_tokens: 5800, output_tokens: 800 });
    expect(priced).toBe(true);
    expect(micros).toBe(5800 * 2 + 800 * 10); // = $0.0196
  });

  it('an unknown model reports itself unpriced', () => {
    expect(computeCostMicros('claude-unknown-9', { input_tokens: 1000 })).toEqual({ micros: 0, priced: false });
  });
});
