import { describe, expect, it } from 'vitest';
import { mapRows, parseWorkbook, reviewHint, skipRowReason, skippedNote } from './parseWorkbook';

describe('skipRowReason — rows that must never become budget lines', () => {
  it.each([
    ['TOTAL EXPENSES', '', 'total'],
    ['Total income', '', 'total'],
    ['Salaries total', '', 'total'],
    ['NET INCOME', '', 'total'],
    ['Gross profit', '', 'total'],
    ['Profit & loss', '', 'total'],
    ['P&L', '', 'total'],
    ['Balance', '', 'total'],
    ['', 'Salaries — subtotal', 'total'],
    ['Sub-total', '', 'total'],
    ['', 'GRAND TOTAL', 'total'],
    ['', '', 'blank'],
    ['   ', 'Salaries', 'blank'],
    ['—', 'Salaries', 'blank'],
    ['-', '', 'blank'],
  ])('%j in %j → %s', (label, section, reason) => {
    expect(skipRowReason(label, section)).toBe(reason);
  });

  it.each([
    ['Ben', 'Salaries'],
    ['Totally Wicked backline', 'Production'],
    ['Net hire', 'Production'],
    ['INSURANCE (3%)', ''],
    ['Bus deposit 50%', 'Transport'],
    ['SALARY CREW', ''],
    ['Balance payment — venue', 'Venue'],
    ['7.5 tonne truck', 'Transport'],
  ])('%j is kept', (label, section) => {
    expect(skipRowReason(label, section)).toBeNull();
  });
});

describe('reviewHint — offered, but unticked', () => {
  it('percentage rows and rows with no amount are unticked with a reason', () => {
    expect(reviewHint({ label: 'INSURANCE (3%)', proposed_cost: 900, actual_cost: 0 })).toMatch(/percentage/);
    expect(reviewHint({ label: 'Commission 15 %', proposed_cost: 0, actual_cost: 0 })).toMatch(/percentage/);
    expect(reviewHint({ label: 'SALARY CREW', proposed_cost: 0, actual_cost: 0 })).toMatch(/No amount/);
    expect(reviewHint({ label: 'Catering', proposed_cost: 0, actual_cost: 120 })).toBeNull();
    expect(reviewHint({ label: 'Ben', proposed_cost: 1000, actual_cost: 0 })).toBeNull();
  });
});

describe('parseWorkbook (our layout)', () => {
  it('drops totals and blanks, keeps everything else, and says what it dropped', () => {
    const p = parseWorkbook({
      Budget: [
        { Section: 'Salaries', Item: 'Ben', Estimate: 1000 },
        { Section: 'Salaries — subtotal', Item: '', Estimate: 1000 },
        { Section: '', Item: 'TOTAL EXPENSES', Estimate: 5000 },
        { Section: '', Item: 'NET INCOME', Estimate: 2000 },
        { Section: '', Item: 'INSURANCE (3%)', Estimate: 150 },
        { Section: '', Item: '', Estimate: '' },
        { Section: '', Item: 'SALARY CREW' },
      ],
    });
    expect(p.proposals.map((x) => x.value.label)).toEqual(['Ben', 'INSURANCE (3%)', 'SALARY CREW']);
    expect(p.skipped?.map((s) => [s.source_ref, s.reason])).toEqual([
      ['Budget!row 3', 'total'],
      ['Budget!row 4', 'total'],
      ['Budget!row 5', 'total'],
      ['Budget!row 7', 'blank'],
    ]);
    expect(p.rejected.join(' ')).toMatch(/Skipped 3 total rows.*“Salaries — subtotal”, “TOTAL EXPENSES”, “NET INCOME”.*Skipped 1 blank row\./);
  });

  it('a clean sheet adds no note', () => {
    const p = parseWorkbook({ Budget: [{ Section: 'Salaries', Item: 'Ben', Estimate: 1 }] });
    expect(p.rejected).toEqual([]);
  });
});

describe('mapRows (foreign layout)', () => {
  it('applies the same skip rules to a mapped sheet', () => {
    const r = mapRows('Sheet1', [{ D: 'Bus', C: 3200 }, { D: 'Total', C: 3200 }, { D: '', C: 0 }], { name: 'D', amount: 'C' });
    expect(r.proposals.map((x) => x.value.label)).toEqual(['Bus']);
    expect(r.skipped.map((s) => s.reason)).toEqual(['total', 'blank']);
  });
});

describe('skippedNote', () => {
  it('names at most four rows', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ source_ref: `r${i}`, label: `Total ${i}`, reason: 'total' as const }));
    expect(skippedNote(rows)).toMatch(/“Total 3” and 2 more/);
    expect(skippedNote([])).toBeNull();
  });
});
