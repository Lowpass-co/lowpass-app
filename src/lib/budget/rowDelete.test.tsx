import { describe, expect, it } from 'vitest';
import { autoSourcesText, deletedToastText, planRowDelete } from './rowDelete';
import { groupedBuckets, viewRows } from '@/components/grid/gridModel';
import type { BudgetLineItem } from '@/types';
import type { Row, Section } from '@/components/grid/types';

const line = (id: string, extra: Partial<BudgetLineItem> = {}) => ({ id, actual_cost: 0, ...extra }) as BudgetLineItem;
const byId = (ls: BudgetLineItem[]) => new Map(ls.map((l) => [l.id, l]));

describe('planRowDelete', () => {
  const lines = byId([
    line('m1'),
    line('m2', { actual_cost: 120 }),
    line('pay', { source_entity_type: 'payroll' }),
    line('pd', { source_entity_type: 'payroll_per_diem' }),
    line('hot', { hotel_id: 'h1' }),
    line('fl', { flight_id: 'f1' }),
    line('gr', { tour_gear_id: 'g1' }),
  ]);

  it('manual rows go; automatic rows are kept and named', () => {
    const p = planRowDelete(['m1', 'pay', 'hot', 'fl', 'gr', 'pd'], lines);
    expect(p.manual).toEqual(['m1']);
    expect(p.auto.map((a) => a.source)).toEqual(['Payroll', 'Rooming', 'Travel', 'Gear', 'Per Diem']);
  });

  it('rows with spending recorded are flagged for a yes first', () => {
    expect(planRowDelete(['m1', 'm2'], lines).withActuals).toEqual(['m2']);
  });

  it('unknown ids and repeats are ignored', () => {
    expect(planRowDelete(['m1', 'm1', 'ghost'], lines)).toEqual({ manual: ['m1'], auto: [], withActuals: [] });
  });

  it('wording', () => {
    const page = (s: string) => ({ Rooming: 'Hotels & rooming', 'Per Diem': 'Payroll' })[s] ?? s;
    expect(autoSourcesText([{ id: 'a', source: 'Payroll' }, { id: 'b', source: 'Per Diem' }], page)).toBe('Payroll');
    expect(autoSourcesText([{ id: 'a', source: 'Payroll' }, { id: 'b', source: 'Rooming' }, { id: 'c', source: 'Gear' }], page)).toBe(
      'Payroll, Hotels & rooming and Gear',
    );
    expect(deletedToastText(1, 0)).toBe('Deleted 1 row');
    expect(deletedToastText(3, 2)).toBe('Deleted 3 rows · kept 2 automatic');
  });
});

describe('viewRows — the selection resolves to the row ON SCREEN', () => {
  const r = (uid: string, status: string, phase = ''): Row => ({ _uid: uid, item: uid, status, phase });
  const data: Section[] = [
    { name: 'A', kind: 'normal', rows: [r('a1', 'paid', 'wrap'), r('a2', 'draft', 'pre_prod')] },
    { name: 'B', kind: 'normal', rows: [r('b1', 'draft'), r('b2', 'paid', 'pre_prod')] },
  ];
  const all = new Set(['draft', 'paid']);
  const uids = (mode: 'section' | 'status' | 'phase') => viewRows(data, mode, '', all, ['draft', 'paid']).map((o) => o.row._uid);

  it('by section it is section order', () => expect(uids('section')).toEqual(['a1', 'a2', 'b1', 'b2']));
  it('by status it is bucket order — not section order', () => expect(uids('status')).toEqual(['a2', 'b1', 'a1', 'b2']));
  it('by phase: known phases in order, untagged last', () => expect(uids('phase')).toEqual(['a2', 'b2', 'a1', 'b1']));

  it('buckets keep the real section index, so a row opens the right line', () => {
    const b = groupedBuckets(data, 'status', '', all, ['draft', 'paid']);
    expect(b.map((x) => [x.key, x.ix, x.rows.map((o) => `${o.si}:${o.ri}`)])).toEqual([
      ['draft', 0, ['0:1', '1:0']],
      ['paid', 1, ['0:0', '1:1']],
    ]);
  });

  it('search and the status filter narrow it the same way the screen does', () => {
    expect(viewRows(data, 'status', 'b', all, ['draft', 'paid']).map((o) => o.row._uid)).toEqual(['b1', 'b2']);
    expect(viewRows(data, 'section', '', new Set(['paid']), ['draft', 'paid']).map((o) => o.row._uid)).toEqual(['a1', 'b2']);
  });
});
