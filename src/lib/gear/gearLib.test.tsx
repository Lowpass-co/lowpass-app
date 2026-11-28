import { describe, expect, it } from 'vitest';
import { alreadyInStock, cleanImportRow, fieldForHeader, parseImport, readListLine, readMoney, readWeight, splitLine } from './importList';
import { cleanHttpsUrl, jsonOf, parseLookup } from './lookup';
import { gearPhotoBelongs, gearPhotoPath } from './photos';

const WS = '00000000-0000-4000-8000-0000000000aa';
const ID = '11111111-1111-4111-8111-111111111111';

describe('import: a pasted list', () => {
  it('reads quantities written several ways', () => {
    expect(readListLine('8 x SM58')).toEqual({ name: 'SM58', quantity: 8 });
    expect(readListLine('8x SM58')).toEqual({ name: 'SM58', quantity: 8 });
    expect(readListLine('SM58 x8')).toEqual({ name: 'SM58', quantity: 8 });
    expect(readListLine('SM58 (12)')).toEqual({ name: 'SM58', quantity: 12 });
    expect(readListLine('- XLR 10m, 40')).toEqual({ name: 'XLR 10m', quantity: 40 });
    expect(readListLine('Shure Beta 58A')).toEqual({ name: 'Shure Beta 58A', quantity: 1 });
    expect(readListLine('   ')).toBeNull();
  });

  it('a list with no commas or tabs is one item per line', () => {
    const p = parseImport('8 x SM58\nAvid S6L\n\n4 Beta 91A');
    expect(p.mode).toBe('list');
    expect(p.rows.map((r) => [r.name, r.quantity])).toEqual([['SM58', 8], ['Avid S6L', 1], ['Beta 91A', 4]]);
  });
});

describe('import: a spreadsheet', () => {
  it('recognises columns by name and reads money, weight and quantity', () => {
    const csv = 'Item,Qty,Category,Serial No,Cost,Replacement Value,Weight\n"Shure SM58, black",8,audio,AB1,"£99.00",$129,0.3 kg\nTotal,8,,,,,';
    const p = parseImport(csv);
    expect(p.mode).toBe('table');
    expect(p.columns).toMatchObject({ name: 'Item', quantity: 'Qty', category: 'Category', serial: 'Serial No', purchaseCost: 'Cost', value: 'Replacement Value', weightKg: 'Weight' });
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ name: 'Shure SM58, black', quantity: 8, category: 'Audio', serial: 'AB1', purchaseCost: 99, value: 129, weightKg: 0.3 });
    expect(p.skipped).toBe(1);
  });

  it('tab-separated (pasted from a sheet) works too', () => {
    const p = parseImport('Name\tQuantity\tDay rate\nLV1\t1\t270');
    expect(p.rows[0]).toMatchObject({ name: 'LV1', quantity: 1, dayRate: 270 });
  });

  it('a comma list with no recognisable header falls back to one per line', () => {
    const p = parseImport('SM58, 8\nBeta 91A, 2');
    expect(p.mode).toBe('list');
    expect(p.rows.map((r) => [r.name, r.quantity])).toEqual([['SM58', 8], ['Beta 91A', 2]]);
  });

  it('header words, quotes, money and weight', () => {
    expect(fieldForHeader('Serial #')).toBe('serial');
    expect(fieldForHeader('Day Rate')).toBe('dayRate');
    expect(fieldForHeader('nonsense')).toBeNull();
    expect(splitLine('"a ""b""",c', ',')).toEqual(['a "b"', 'c']);
    expect(readMoney('£1,250.50')).toBe(1250.5);
    expect(readMoney('')).toBeNull();
    expect(readWeight('5 lb')).toBe(2.27);
    expect(readWeight('300 g')).toBe(0.3);
  });

  it('the row gate refuses no name, clamps quantity, keeps unknown categories as typed', () => {
    expect(cleanImportRow({ name: '  ' })).toBeNull();
    expect(cleanImportRow({ name: 'X', quantity: 0 })?.quantity).toBe(1);
    expect(cleanImportRow({ name: 'X', category: 'lighting' })?.category).toBe('Lighting');
    expect(cleanImportRow({ name: 'X', category: 'IEMs' })?.category).toBe('IEMs');
  });

  it('flags names already in stock', () => {
    const p = parseImport('SM58\nNew thing');
    expect([...alreadyInStock(p.rows, ['sm58 ', 'Other'])]).toEqual([0]);
  });
});

describe('lookup: the gate', () => {
  it('takes a good answer, cleans numbers, maps the category, drops non-https links', () => {
    const r = parseLookup(jsonOf('Here you go: ```json\n' + JSON.stringify({
      name: 'AKG C414 XLII',
      manufacturer: 'AKG',
      model: 'C414 XLII',
      category: 'audio',
      description: 'Multi-pattern large-diaphragm condenser microphone.',
      retail: { amount: '1,099.00', currency: 'usd' },
      weight_kg: 0.3,
      dimensions_cm: { l: 16, w: 5, h: 3.8 },
      image_url: 'https://example.com/414.jpg',
      sources: ['https://akg.com/414', 'http://insecure.example', 'javascript:alert(1)'],
    }) + '\n```'));
    expect(r).toMatchObject({
      name: 'AKG C414 XLII', category: 'Audio', retail: { amount: 1099, currency: 'USD' },
      weightKg: 0.3, dimensionsCm: { l: 16, w: 5, h: 3.8 }, imageUrl: 'https://example.com/414.jpg',
    });
    expect(r?.sources).toEqual(['https://akg.com/414']);
  });

  it('no name = nothing; silly numbers and half dimensions are dropped', () => {
    expect(parseLookup({ manufacturer: 'AKG' })).toBeNull();
    expect(parseLookup(null)).toBeNull();
    const r = parseLookup({ name: 'X', retail: { amount: -5, currency: 'USD' }, weight_kg: 99999, dimensions_cm: { l: 1 }, category: 'Toasters' });
    expect(r).toMatchObject({ retail: null, weightKg: null, dimensionsCm: null, category: null });
  });

  it('https links only', () => {
    expect(cleanHttpsUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(cleanHttpsUrl('http://a.com/x')).toBeNull();
    expect(cleanHttpsUrl('https://user:pw@a.com/x')).toBeNull();
    expect(jsonOf('no json here')).toBeNull();
  });
});

describe('gear photos', () => {
  it('only this workspace’s own photo paths pass', () => {
    const p = gearPhotoPath(WS, ID, 'image/png');
    expect(p).toBe(`gear-photos/${WS}/${ID}.png`);
    expect(gearPhotoBelongs(p, WS)).toBe(true);
    expect(gearPhotoBelongs(p, '00000000-0000-4000-8000-0000000000bb')).toBe(false);
    expect(gearPhotoBelongs(`gear-photos/${WS}/../x.png`, WS)).toBe(false);
    expect(gearPhotoBelongs(`gear-photos/${WS}/${ID}.svg`, WS)).toBe(false);
  });
});
