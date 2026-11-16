import { describe, expect, it } from 'vitest';
import { parseAccessRows } from './accessRows';

const T = '10000000-0000-4000-8000-000000000001';
describe('parseAccessRows', () => {
  it('accepts all-tours and per-tour rows; edit wins on duplicates', () => {
    expect(parseAccessRows([
      { tour_id: null, area: 'files', level: 'view' },
      { tour_id: T, area: 'parking', level: 'view' },
      { tour_id: T, area: 'parking', level: 'edit' },
    ])).toEqual([
      { tour_id: null, area: 'files', level: 'view' },
      { tour_id: T, area: 'parking', level: 'edit' },
    ]);
  });
  it('refuses unknown areas, levels and bad ids', () => {
    expect(parseAccessRows([{ tour_id: null, area: 'merch', level: 'view' }])).toMatch(/unknown area/);
    expect(parseAccessRows([{ tour_id: null, area: 'files', level: 'admin' }])).toMatch(/level/);
    expect(parseAccessRows([{ tour_id: 'x', area: 'files', level: 'view' }])).toMatch(/uuid/);
    expect(parseAccessRows('nope')).toMatch(/array/);
  });
});
