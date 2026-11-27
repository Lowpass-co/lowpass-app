import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/auraBudgetSheet.json';
import { money, percent, readSheetBudget, sheetDate, type SheetTabs } from './sheetBudget';

/* The fixture is Adam's Au/Ra "USA Headline Shows '26" budget as the Sheets
   API returns it (formatted values), shortened, names swapped and links
   removed. Every expected figure below is in that sheet. */
const plan = readSheetBudget(fixture as SheetTabs);

describe('cells', () => {
  it('reads the template’s money, percent and date formats', () => {
    expect(money('$9,070.00')).toBe(9070);
    expect(money(' $ 4,585.00 ')).toBe(4585);
    expect(money('-$22,612.61')).toBe(-22612.61);
    expect(money(' $ -   ')).toBe(0);
    expect(money('#DIV/0!')).toBeNull();
    expect(money('')).toBeNull();
    expect(percent('30.0%')).toBe(30);
    expect(sheetDate('2-Dec-2026')).toBe('2026-12-02');
    expect(sheetDate('27/11/2026')).toBe('2026-11-27');
    expect(sheetDate('next Tuesday')).toBeNull();
  });
});

describe('Adam’s budget sheet → an import plan', () => {
  it('title from the summary', () => {
    expect(plan.title).toBe("USA Headline Shows '26");
  });

  it('show deals from Routing & Income, every routing day kept for matching', () => {
    expect(plan.shows.map((s) => [s.date, s.dayType])).toEqual([
      ['2026-11-27', 'OFF'], ['2026-11-28', 'REHEARSAL'], ['2026-12-02', 'SHOW'], ['2026-12-03', 'OFF'], ['2026-12-04', 'SHOW'],
    ]);
    expect(plan.shows[2]).toEqual({
      date: '2026-12-02', dayType: 'SHOW', venue: "BABY'S ALL RIGHT", city: 'NYC, NY', capacity: 280,
      guarantee: 2500, withholdingPct: 30, overage: 0, merch: 1649.92, vip: null,
    });
    expect(plan.shows[3].venue).toBeNull(); // "-" on an off day
  });

  it('commissions and overheads from the summary', () => {
    expect(plan.commissions).toEqual([
      { label: 'Management', pct: 0 }, { label: 'Agency', pct: 0 }, { label: 'Legal', pct: 0 }, { label: 'Merch COG', pct: 50 },
    ]);
    expect(plan.overheads).toEqual({ accountancy: 0, insurance: 3, contingency: 2 });
  });

  it('salaries by role, the advance row marked as an advance, per diems', () => {
    expect(plan.rates.map((r) => [r.role, r.group, r.showRate, r.offRate, r.projected, r.advance, r.empty])).toEqual([
      ['Tour Manager | Advance', 'crew', 135, 135, 810, true, false],
      ['Tour Manager', 'crew', 540, 540, 4860, false, false],
      ['Production Manager | Advance', 'crew', null, null, 0, true, true],
      ['Content', 'crew', 200, 200, 400, false, false],
      ['Drums', 'band', 250, 250, 1500, false, false],
      ['Keys', 'band', 250, 250, 0, false, false],
    ]);
    expect(plan.rates[1].note).toBe('ONE OFF FLAT RATE FOR THIS SHOW');
    expect(plan.perDiems).toEqual([{ role: 'Tour Manager', rate: 27 }, { role: 'Drums', rate: 27 }]);
  });

  it('budget lines from the side-by-side blocks, totals never read, blanks offered unticked', () => {
    const t = plan.lines.filter((l) => !l.empty).map((l) => [l.section, l.block, l.label, l.proposed]);
    expect(t).toEqual([
      ['Transport', 'TAXIS', 'Ubers @$30/day', 210],
      ['Transport', 'MISC TRANSPORT', 'Truck Rental NYC (3) Days', 500],
      ['Transport', 'MISC TRANSPORT', 'Car Rental LAX (5) Days', 600],
      ['Transport', 'FUEL', 'NYC Fuel', 30],
      ['Transport', 'PARKING', 'NYC Parking @ $50/day', 100],
      ['Production', 'AUDIO + BACKLINE', 'Audio Hire (Lowpass Quoted)', 2720],
      ['Production', 'PROGRAMMING + SET-UP', 'Rehearsal Room (3) Days', 900],
      ['Production', 'PROGRAMMING + SET-UP', 'Musical Direction', 1200],
      ['Production', 'FREIGHT + BAGGAGE', 'NY Return Bags (Apprx for 7 fly cases @ media $70)', 980],
      ['Misc', 'MISC PROD', 'Carnet (If Au/Ra brings gear)', 1000],
      ['Production', 'EQUIPMENT PURCHASES', 'Consumables', 75],
    ]);
    expect(plan.lines.filter((l) => l.empty).map((l) => l.label)).toEqual(['Backline Hire (House in NY/Drummers in LA)']);
    expect(plan.lines.some((l) => /total/i.test(l.label))).toBe(false);
  });

  it('flights per leg, with the person as written', () => {
    expect(plan.flights).toEqual([
      { person: 'ALEX ONE', from: 'BNA', to: 'BUR', proposed: 275, actual: 270.7, leg: 1 },
      { person: 'ALEX ONE', from: 'LAX', to: 'LGA', proposed: 310, actual: 335, leg: 2 },
      { person: 'BAND', from: 'LAX', to: 'LGA', proposed: 310, actual: 335, leg: 2 },
    ]);
  });

  it('hotels with the people listed under them', () => {
    expect(plan.hotels).toEqual([
      {
        label: 'WHOLE TOUR HOTELS BAND+CREW (ROOMING LIST LINKED HERE)', city: null, dateIn: null, dateOut: null,
        nights: 8, rooms: 4, proposed: 4000, actual: null,
        people: [{ name: 'Alex', nights: 8, rooms: 1 }, { name: 'Sam', nights: 7, rooms: 1 }],
      },
    ]);
  });

  it('a GN budget (no Transportation tab) reads what it has and says what it lacked', () => {
    const { TRANSPORTATION: _t, ...gn } = fixture as SheetTabs;
    void _t;
    const p = readSheetBudget(gn);
    expect(p.lines.every((l) => l.section !== 'Transport')).toBe(true);
    expect(p.shows).toHaveLength(5);
    expect(readSheetBudget({}).notes).toHaveLength(2);
  });
});
