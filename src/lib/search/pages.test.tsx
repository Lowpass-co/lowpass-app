import { describe, expect, it } from 'vitest';
import { pageCommands, searchPages } from './pages';
import { itemsFor } from '@/lib/nav/ia';

const inTour = { tourId: 't1', artistId: null };
const labels = (q: string, ctx = inTour) => searchPages(q, ctx).map((r) => r.label);

describe('⌘K pages', () => {
  it('every sidebar page is findable by its own name — nothing to add when the rail grows', () => {
    const cmds = pageCommands(inTour);
    for (const scope of ['tour', 'workspace', 'you'] as const) {
      for (const item of itemsFor(scope, null)) {
        expect(cmds.some((c) => c.label === item.label), `${scope}:${item.label}`).toBe(true);
      }
    }
  });

  it('finds the page by the start of a word, best match first', () => {
    expect(labels('pay')[0]).toBe('Payroll');
    expect(labels('hot')[0]).toBe('Hotels & rooming');
    expect(labels('rec')[0]).toBe('Receipts');
  });

  it('by the words people actually type', () => {
    expect(labels('schedule')).toContain('Dates & routing');
    expect(labels('edit tour')[0]).toBe('Tour details');
    expect(labels('import')).toContain('Import dates');
    expect(labels('flights')).toContain('Travel');
    expect(labels('invite')).toContain('Team & roles');
  });

  it('pages of this tour carry this tour’s id', () => {
    const r = searchPages('payroll', inTour)[0];
    expect(r.action).toEqual({ type: 'navigate', href: '/operations/t1/payroll' });
    expect(searchPages('import', inTour).find((x) => x.label === 'Import dates')?.action).toEqual({
      type: 'navigate',
      href: '/operations/t1/routing?import=1',
    });
  });

  it('outside a tour, tour pages are not offered (there is no tour to open them in)', () => {
    expect(labels('payroll', { tourId: null, artistId: null })).toEqual([]);
    expect(labels('venues', { tourId: null, artistId: null })).toEqual(['Venues']);
  });

  it('New tour is an action, not a link', () => {
    expect(searchPages('new tour', inTour)[0]).toMatchObject({ label: 'New tour', action: { type: 'command', run: 'new-tour' } });
  });

  it('letters scattered across words do not match', () => {
    expect(labels('pyrl')).toEqual([]);
    expect(labels('zzz')).toEqual([]);
  });

  it('one row per place, at most six', () => {
    const r = searchPages('settings', inTour);
    expect(new Set(r.map((x) => JSON.stringify(x.action))).size).toBe(r.length);
    expect(searchPages('a', inTour).length).toBeLessThanOrEqual(6);
  });
});
