import { describe, expect, it } from 'vitest';
import { readAddQuery, searchStock } from './AddGear';
import type { RentalInventoryItem } from './types';

const item = (id: string, name: string, extra: Partial<RentalInventoryItem> = {}): RentalInventoryItem => ({
  id, name, user_id: '', category: 'Audio', serial_number: null, country_of_origin: null, purchase_cost: null,
  day_rate: 4, weight_kg: null, image_url: null, notes: null, created_at: '', ...extra,
});

describe('Add gear', () => {
  it('reads a leading quantity', () => {
    expect(readAddQuery('8 sm58')).toEqual({ qty: 8, text: 'sm58' });
    expect(readAddQuery('8x sm58')).toEqual({ qty: 8, text: 'sm58' });
    expect(readAddQuery('12 × xlr 10m')).toEqual({ qty: 12, text: 'xlr 10m' });
    expect(readAddQuery('sm58')).toEqual({ qty: 1, text: 'sm58' });
    // A model number on its own is a search, not a quantity.
    expect(readAddQuery('58')).toEqual({ qty: 1, text: '58' });
    expect(readAddQuery('0 sm58')).toEqual({ qty: 1, text: '0 sm58' });
  });

  it('matches every word, names starting with the first word first, retired last', () => {
    const stock = [
      item('a', 'Shure Beta 58A'),
      item('b', 'SM58', { serial_number: 'X1' }),
      item('c', 'SM58 (old)', { status: 'retired' }),
      item('d', 'XLR 10m', { category: 'Cables' }),
    ];
    expect(searchStock(stock, 'sm58').map((i) => i.id)).toEqual(['b', 'c']);
    expect(searchStock(stock, '58').map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(searchStock(stock, 'cables').map((i) => i.id)).toEqual(['d']);
    expect(searchStock(stock, 'shure 58a').map((i) => i.id)).toEqual(['a']);
    expect(searchStock(stock, '   ')).toEqual([]);
  });
});
