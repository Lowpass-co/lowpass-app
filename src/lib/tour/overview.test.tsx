import { describe, expect, it } from 'vitest';
import { ALLOW_ALL, advanceLine, budgetLine, needsYou, nextShow, productionLine, whenText, type OverviewFacts, type OverviewShow } from './overview';

const TODAY = '2026-11-09';
const show = (date: string, extra: Partial<OverviewShow> = {}): OverviewShow => ({
  routingId: `r-${date}`,
  date,
  dayType: 'show',
  venue: 'Venue',
  city: 'City',
  answered: 10,
  total: 10,
  toReview: 0,
  requestKind: 'done',
  requestLabel: 'Done',
  ...extra,
});
const facts = (extra: Partial<OverviewFacts> = {}): OverviewFacts => ({
  tourId: 't1',
  today: TODAY,
  allow: ALLOW_ALL,
  shows: [],
  settledRoutingIds: new Set(),
  receiptsNeedingDetails: 0,
  linesOverEstimate: 0,
  money: null,
  production: [],
  ...extra,
});

describe('next show', () => {
  it('is the next show or festival day, today included — not a day off or rehearsal', () => {
    const f = facts({
      shows: [
        show('2026-11-08'),
        show('2026-11-09', { dayType: 'rehearsal' }),
        show('2026-11-12', { venue: 'bp pulse LIVE' }),
        show('2026-11-10', { dayType: 'festival', venue: 'Fest' }),
      ],
    });
    expect(nextShow(f)).toMatchObject({ venue: 'Fest', inDays: 1 });
    expect(nextShow(facts())).toBeNull();
  });
  it('says when in words', () => {
    expect([whenText(0), whenText(1), whenText(3)]).toEqual(['today', 'tomorrow', 'in 3 days']);
  });
});

describe('needs you', () => {
  it('nothing to do → empty (the page then says so)', () => {
    expect(needsYou(facts({ shows: [show('2026-11-12')] }))).toEqual([]);
  });

  it('every kind of item, each with its count and the page that fixes it', () => {
    const f = facts({
      shows: [
        show('2026-11-01'), // played, not settled
        show('2026-11-02'), // played, settled
        show('2026-11-12', { answered: 4, toReview: 2, requestKind: 'answered' }), // soon, not advanced
        show('2026-12-30', { answered: 0 }), // not soon — not counted as soon
      ],
      settledRoutingIds: new Set(['r-2026-11-02']),
      receiptsNeedingDetails: 3,
      linesOverEstimate: 2,
    });
    expect(needsYou(f).map((n) => [n.id, n.count, n.href])).toEqual([
      ['advance-soon', 1, '/advance/t1'],
      ['advance-review', 2, '/advance/t1'],
      ['settle', 1, '/budget/t1?tab=income'],
      ['receipts', 3, '/budget/t1?tab=receipts'],
      ['over-estimate', 2, '/budget/t1?tab=budget'],
    ]);
    expect(needsYou(f)[0].text).toBe('1 day in the next two weeks isn’t fully advanced');
  });

  it('a day with no questions set up counts as not advanced', () => {
    expect(needsYou(facts({ shows: [show('2026-11-10', { total: 0, answered: 0 })] }))[0].id).toBe('advance-soon');
  });

  it('a part the viewer cannot open is never mentioned', () => {
    const f = facts({
      allow: { advance: false, budget: false, receipts: false, production: false },
      shows: [show('2026-11-01'), show('2026-11-10', { answered: 0, toReview: 1 })],
      receiptsNeedingDetails: 3,
      linesOverEstimate: 2,
    });
    expect(needsYou(f)).toEqual([]);
  });
});

describe('the three area lines', () => {
  it('advance', () => {
    expect(advanceLine(facts())).toBe('No days to advance yet');
    expect(
      advanceLine(facts({ shows: [show('2026-11-10'), show('2026-11-11', { answered: 2, requestKind: 'sent' }), show('2026-11-12', { answered: 0, requestKind: 'not_sent' })] })),
    ).toBe('1 of 3 days ahead fully advanced · 1 waiting on a venue');
    // Days already played don't count.
    expect(advanceLine(facts({ shows: [show('2026-11-01'), show('2026-11-10', { answered: 0 })] }))).toBe('0 of 1 day ahead fully advanced');
    expect(advanceLine(facts({ shows: [show('2026-11-01')] }))).toBe('No days left to advance');
  });
  it('budget, in the tour currency', () => {
    expect(budgetLine(facts())).toBe('Budget not set up yet');
    expect(budgetLine(facts({ money: { currency: 'GBP', plannedCosts: 48000, spentCosts: 12400.4, plannedNet: -1500 } }))).toBe(
      '£35,600 left · £12,400 spent of £48,000 · −£1,500 net',
    );
    // Over budget, no income planned: no "net" (it was just the costs negated).
    expect(budgetLine(facts({ money: { currency: 'GBP', plannedCosts: 43562, spentCosts: 46011, plannedNet: -43562 } }))).toBe(
      '£2,449 over · £46,011 spent of £43,562',
    );
  });
  it('production — the rider by its published version, then the other documents', () => {
    expect(productionLine(facts({ production: [{ kind: 'channel_list', count: 2, updatedAt: '2026-11-06T10:00:00Z' }] }))).toBe(
      'Rider not made · Channel list updated 3 days ago · Stage plot not made',
    );
    const riders = { docs: 2, latest: { label: '1.7', publishedAt: '2026-11-08T09:00:00Z' }, toSend: 0, toAnswer: 0 };
    expect(productionLine(facts({ riders }))).toBe('Rider version 1.7, published yesterday · Channel list not made · Stage plot not made');
    expect(productionLine(facts({ riders: { ...riders, latest: null } }))).toMatch(/^Rider not published yet · /);
    // An old builder 'rider' pack no longer counts as the rider.
    expect(productionLine(facts({ production: [{ kind: 'rider', count: 1, updatedAt: '2026-11-06T10:00:00Z' }] }))).toMatch(/^Rider not made · /);
  });
});

describe('needs you — the rider', () => {
  const riders = { docs: 2, latest: { label: '2.1', publishedAt: '2026-11-08T09:00:00Z' }, toSend: 3, toAnswer: 2 };
  it('replies to answer, then shows not sent the latest version — each a link to that tab', () => {
    const lines = needsYou(facts({ riders }));
    expect(lines.map((l) => [l.id, l.count, l.href])).toEqual([
      ['rider-replies', 2, '/operations/t1/riders?panel=replies'],
      ['rider-send', 3, '/operations/t1/riders?panel=shows'],
    ]);
    expect(lines[0].text).toBe('2 rider replies to answer');
    expect(lines[1].text).toBe('3 shows haven’t been sent rider version 2.1');
    expect(needsYou(facts({ riders: { ...riders, toSend: 1, toAnswer: 1 } })).map((l) => l.text)).toEqual([
      '1 rider reply to answer',
      '1 show hasn’t been sent rider version 2.1',
    ]);
  });
  it('nothing published → nothing to send; no production access → no rider lines', () => {
    expect(needsYou(facts({ riders: { ...riders, latest: null, toAnswer: 0 } }))).toEqual([]);
    expect(needsYou(facts({ riders, allow: { ...ALLOW_ALL, production: false } }))).toEqual([]);
  });
  it('sits after the advance lines (venue work), before money', () => {
    const f = facts({ riders, shows: [show('2026-11-12', { answered: 2 })], receiptsNeedingDetails: 1 });
    expect(needsYou(f).map((l) => l.id)).toEqual(['advance-soon', 'rider-replies', 'rider-send', 'receipts']);
  });
});
