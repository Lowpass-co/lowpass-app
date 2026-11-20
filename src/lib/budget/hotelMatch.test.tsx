import { describe, it, expect } from 'vitest';
import { matchHotel, isHotelReceipt, type HotelLine } from './hotelMatch';
import { resolveSection } from './receiptSection';
import { proposeForReceipt } from './receiptMatch';

/* Nov 2026 (Adam): hotel receipts went to Uncategorised; they should land on
   the hotel in Rooming. */
const hotels: HotelLine[] = [
  { lineId: 'L-hilton', name: 'Hilton Garden Inn', city: 'Nashville', checkIn: '2026-11-10', checkOut: '2026-11-13' },
  { lineId: 'L-hoxton', name: 'The Hoxton Shoreditch', city: 'London', checkIn: '2026-11-15', checkOut: '2026-11-17' },
];
const r = (o: Partial<{ category: string | null; vendor: string | null; date: string | null }>) => ({
  category: null, vendor: null, date: null, description: null, ...o,
});

describe('matchHotel', () => {
  it('by name — the vendor names a hotel in Rooming', () => {
    expect(matchHotel(r({ vendor: 'Hilton Garden Inn Nashville Downtown', date: '2026-12-01' }), hotels)?.lineId).toBe('L-hilton');
    expect(matchHotel(r({ vendor: 'HOXTON SHOREDITCH' }), hotels)?.lineId).toBe('L-hoxton');
  });

  it('by date — a hotel bill on a night you are at exactly one hotel', () => {
    const m = matchHotel(r({ category: 'Hotels', vendor: 'Front desk', date: '2026-11-16' }), hotels);
    expect(m?.lineId).toBe('L-hoxton');
    expect(m?.reason).toContain('2026-11-16');
  });

  it('no guess when two stays overlap the date, or the receipt is not a hotel bill', () => {
    const overlapping = [...hotels, { lineId: 'L-other', name: 'Ace', city: 'London', checkIn: '2026-11-15', checkOut: '2026-11-16' }];
    expect(matchHotel(r({ category: 'hotel', date: '2026-11-16' }), overlapping)).toBeNull();
    expect(matchHotel(r({ category: 'Catering', vendor: 'Pret', date: '2026-11-16' }), hotels)).toBeNull();
  });

  it('knows a hotel bill from its words', () => {
    expect(isHotelReceipt(r({ vendor: 'Premier Inn Leeds' }))).toBe(true);
    expect(isHotelReceipt(r({ category: 'lodging' }))).toBe(true);
    expect(isHotelReceipt(r({ vendor: 'Shell' }))).toBe(false);
  });
});

describe('a hotel receipt with no hotel line', () => {
  it('files under Accommodation when that is what the tour calls it', () => {
    const res = resolveSection('Hotels', [{ id: 's-acc', name: 'Accommodation' }, { id: 's-tr', name: 'Travel' }]);
    expect(res).toMatchObject({ sectionId: 's-acc', createSection: false });
  });

  it('the proposal links to the hotel line ahead of any new line', () => {
    const p = proposeForReceipt(
      { vendor: 'Hilton Garden Inn', date: '2026-11-11', total_amount: 410, currency: 'USD', category: 'Hotels', description: null },
      [],
      [],
      { hotels, sections: [{ id: 's-acc', name: 'Accommodation' }] },
    );
    expect(p).toMatchObject({ target: 'receipt_txn', lineItemId: 'L-hilton' });
    expect(p.reason).toMatch(/Rooming/);
  });
});
