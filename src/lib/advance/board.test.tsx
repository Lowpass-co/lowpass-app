/* The Advance board's rules: one place decides what a cell, a show header and
   a section tab say, so they can't disagree. */
import { describe, expect, it } from 'vitest';
import {
  boardColumns,
  changeCount,
  dayChanges,
  newFieldId,
  questionSections,
  requestLabel,
  requestState,
  searchShow,
  sectionProgress,
  summariseShow,
  type AdvSection,
} from './board';

const sched: AdvSection = {
  template_id: 's1',
  label: 'Schedule',
  order: 1,
  fields: [
    { id: 'doors', label: 'Doors', type: 'time' },
    { id: 'curfew', label: 'Curfew', type: 'time' },
  ],
};
const prod: AdvSection = {
  template_id: 's2',
  label: 'Production',
  order: 2,
  fields: [
    { id: 'pa', label: 'PA system', type: 'text' },
    { id: 'power', label: 'Power details', type: 'textarea' },
    { id: 'pm', label: 'Production manager', type: 'contact' }, // not counted
  ],
};
const settle: AdvSection = { template_id: 's3', label: 'Settlement', order: 3, tm_only: true, fields: [{ id: 'when', label: 'When', type: 'text' }] };
const hotel: AdvSection = { template_id: 'h', label: 'Hotel', order: 0, fields: [{ id: 'name', label: 'Hotel name', type: 'text' }] };
const contacts: AdvSection = { template_id: 'k', label: 'Key Contacts', order: 0, fields: [] };

describe('sections', () => {
  it('hides the sections whose facts live on other pages, and contacts', () => {
    expect(questionSections([settle, hotel, prod, contacts, sched]).map((s) => s.label)).toEqual(['Schedule', 'Production', 'Settlement']);
  });

  it('a section is review > done > asked > partial > none', () => {
    expect(sectionProgress(sched, {}, {}, false).state).toBe('none');
    expect(sectionProgress(sched, { s1: { doors: '19:00' } }, {}, false).state).toBe('partial');
    expect(sectionProgress(sched, { s1: { doors: '19:00' } }, {}, true).state).toBe('asked');
    expect(sectionProgress(sched, { s1: { doors: '19:00', curfew: '23:00' } }, {}, true).state).toBe('done');
    expect(sectionProgress(sched, { s1: { doors: '19:00', curfew: '23:00' } }, { s1: 1 }, true).state).toBe('review');
    // only-you sections are never "asked"
    expect(sectionProgress(settle, {}, {}, true).state).toBe('none');
  });

  it('contacts and blank strings don’t count; false is an answer', () => {
    const p = sectionProgress(prod, { s2: { pa: '  ', power: 'none' } }, {}, false);
    expect([p.answered, p.total]).toEqual([1, 2]);
    const b = sectionProgress({ ...sched, fields: [{ id: 'x', label: 'Shore power', type: 'boolean' }] }, { s1: { x: false } }, {}, false);
    expect(b.state).toBe('done');
  });

  it('a show is complete only with every answer in and nothing to review', () => {
    const data = { s1: { doors: '19:00', curfew: '23:00' }, s2: { pa: 'K2', power: '125A' }, s3: { when: 'After set' } };
    expect(summariseShow([sched, prod, settle, hotel], data, {}, false).complete).toBe(true);
    expect(summariseShow([sched, prod, settle], data, { s2: 1 }, false).complete).toBe(false);
  });
});

describe('venue request', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const base = { status: 'pending', created_at: '2026-10-10T10:00:00Z' };
  it('walks not sent → made → sent → opened → answered → done', () => {
    expect(requestState([], 0, false, now).kind).toBe('not_sent');
    expect(requestState([base], 0, false, now).kind).toBe('made');
    expect(requestState([{ ...base, sent_at: '2026-10-18T10:00:00Z' }], 0, false, now)).toMatchObject({ kind: 'sent', chase: false, live: true });
    expect(requestState([{ ...base, sent_at: '2026-10-11T10:00:00Z' }], 0, false, now)).toMatchObject({ kind: 'sent', chase: true });
    expect(requestState([{ ...base, sent_at: '2026-10-11T10:00:00Z', last_viewed_at: '2026-10-19T10:00:00Z' }], 0, false, now).kind).toBe('opened');
    expect(requestState([{ ...base, status: 'submitted', submitted_at: '2026-10-19T10:00:00Z' }], 4, false, now)).toMatchObject({ kind: 'answered', toReview: 4, live: false });
    expect(requestState([base], 0, true, now).kind).toBe('done');
  });
  it('ignores revoked and expired links', () => {
    expect(requestState([{ ...base, status: 'revoked' }], 0, false, now).kind).toBe('not_sent');
    expect(requestState([{ ...base, sent_at: base.created_at, expires_at: '2026-10-15T00:00:00Z' }], 0, false, now).live).toBe(false);
  });
  it('says it in words', () => {
    expect(requestLabel(requestState([{ ...base, sent_at: '2026-10-16T10:00:00Z' }], 0, false, now), now)).toBe('Sent 4 days ago');
    expect(requestLabel(requestState([{ ...base, status: 'submitted' }], 12, false, now), now)).toBe('Answered · 12 to review');
    expect(requestLabel(requestState([{ ...base, sent_at: '2026-10-01T10:00:00Z' }], 0, false, now), now)).toBe('No answer · sent 19 days ago');
  });
});

describe('board', () => {
  it('columns are every question section, in their usual order', () => {
    const cols = boardColumns([{ sections: [prod, sched] }, { sections: [{ ...sched, order: 0 }, prod, settle, hotel] }]);
    expect(cols.map((c) => c.label)).toEqual(['Schedule', 'Production', 'Settlement']);
  });

  it('search matches across answers, venue and city', () => {
    const data = { s2: { power: '125A CEE stage left' }, s1: { curfew: '23:00' } };
    expect(searchShow('stage left power', [sched, prod], data).match).toBe(true);
    expect(searchShow('curfew', [sched, prod], data).hits[0]).toEqual({ label: 'Curfew', value: '23:00' });
    expect(searchShow('wembley', [sched], {}, ['OVO Arena Wembley', 'London']).match).toBe(true);
    expect(searchShow('shore power', [sched, prod], data).match).toBe(false);
  });
});

describe('customising a day', () => {
  it('counts sections off, sections added and questions added', () => {
    const day = [sched, { ...prod, fields: [...prod.fields, { id: 'day_ferry', label: 'Ferry', type: 'text', day_only: true }] }];
    const c = dayChanges(day, [sched, prod, settle, hotel]);
    expect(c).toEqual({ off: ['Settlement'], added: [], addedQuestions: 1 });
    expect(changeCount(c)).toBe(2);
  });
  it('new question ids are unique and readable', () => {
    expect(newFieldId('Ferry crossing (trucks)!', [])).toBe('day_ferry_crossing_trucks');
    expect(newFieldId('Ferry', ['day_ferry'])).toBe('day_ferry_2');
  });
});
