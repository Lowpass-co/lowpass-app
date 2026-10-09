/* ============================================
   LOWPASS — budget grid declutter (Oct 2026)

   Hidden: automatic lines with nothing on them. Never hidden: a manual line
   (you type there — and a line you just added starts at £0), an automatic
   line with any money, receipt or document on it, or an already-empty
   section (it's where you add the first line).
   ============================================ */

import { describe, it, expect } from 'vitest';
import { hideEmptyAutoRows, isEmptyAutoRow } from './budgetAdapter';
import type { Section } from '@/components/grid/types';

const auto = (uid: string, over: Record<string, unknown> = {}) => ({ _uid: uid, _derived: true, est: 0, act: 0, txnCount: 0, docCount: 0, ...over });
const manual = (uid: string, over: Record<string, unknown> = {}) => ({ _uid: uid, _derived: false, est: 0, act: 0, ...over });

describe('isEmptyAutoRow', () => {
  it('an automatic £0 line with nothing attached is empty', () => {
    expect(isEmptyAutoRow(auto('a'))).toBe(true);
  });
  it.each([
    ['planned cost', { est: 10 }],
    ['actual', { act: 5 }],
    ['a receipt', { txnCount: 1 }],
    ['a document', { docCount: 1 }],
  ])('an automatic line with %s is NOT empty', (_l, over) => {
    expect(isEmptyAutoRow(auto('a', over))).toBe(false);
  });
  it('a MANUAL £0 line is never hidden — it is where you type', () => {
    expect(isEmptyAutoRow(manual('m'))).toBe(false);
  });
});

describe('hideEmptyAutoRows', () => {
  const sections: Section[] = [
    { _uid: 'hotels', name: 'Hotels', kind: 'derived', rows: [auto('h1', { est: 550 }), auto('h2'), auto('h3')] },
    { _uid: 'unassigned', name: 'Unassigned', kind: 'derived', rows: [auto('u1'), auto('u2')] },
    { _uid: 'backline', name: 'Backline', kind: 'normal', rows: [manual('b1')] },
    { _uid: 'empty', name: 'Salary', kind: 'normal', rows: [] },
  ];

  it('drops the empty automatic rows and reports them per section', () => {
    const r = hideEmptyAutoRows(sections);
    expect(r.hiddenCount).toBe(4);
    expect(r.hiddenBySection.get('hotels')).toEqual(['h2', 'h3']);
    expect(r.data.find((s) => s._uid === 'hotels')!.rows.map((x) => x._uid)).toEqual(['h1']);
  });

  it('a section left with nothing BY THE FILTER goes; an already-empty one stays', () => {
    const ids = hideEmptyAutoRows(sections).data.map((s) => s._uid);
    expect(ids).toEqual(['hotels', 'backline', 'empty']);
  });

  it('does not mutate the input', () => {
    hideEmptyAutoRows(sections);
    expect(sections[0].rows).toHaveLength(3);
  });
});
