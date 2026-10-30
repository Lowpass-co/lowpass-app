/* ============================================
   Advance exports (Oct 2026): the filled advance and the venue question
   sheet — what they print, what they never print, and the config contract.
   ============================================ */

import { describe, it, expect } from 'vitest';
import { answerGroups, displayValue, questionGroups, showContacts, sourceLabel } from './advance-data';
import { buildAdvanceBodyHtml, buildAdvanceQuestionsBodyHtml } from './advance-pdf';
import { defaultConfig, normalizeConfig, EXPORT_SURFACES } from './template-config';
import type { AdvanceExportData, AdvanceQuestionsData } from './advance-data';

const SECTIONS = [
  { template_id: 's1', label: 'Schedule', order: 0, fields: [{ id: 'doors', label: 'Doors', type: 'time' }, { id: 'curfew', label: 'Curfew', type: 'time' }] },
  { template_id: 's2', label: 'Settlement', order: 1, tm_only: true, fields: [{ id: 'who', label: 'Settle with', type: 'text' }] },
  { template_id: 'kc', label: 'Key Contacts', order: 2, fields: [{ id: 'c', label: 'Contacts', type: 'contact' }] },
  { template_id: 's3', label: 'Production', order: 3, fields: [{ id: 'pa', label: 'PA <system>', type: 'textarea' }, { id: 'crew', label: 'Local crew', type: 'labor_call' }, { id: 'barricade', label: 'Barricade', type: 'boolean' }] },
];
const DATA = {
  s1: { doors: '19:00' },
  s2: { who: 'Alyson' },
  s3: { pa: 'Clair i-3', barricade: false },
  kc: { contacts: [{ first_name: 'Alyson', last_name: 'Estes', role: 'PM', email: 'a@x.com' }, { first_name: 'Alyson', last_name: 'Estes', role: 'PM', email: 'a@x.com' }] },
};

const head = {
  artist: { name: 'Chance Peña', logoUrl: null },
  tour: { id: 't', name: 'Fall', start_date: null, end_date: null },
  show: { date: '2026-09-09', dayType: 'show', city: 'Nashville', templateName: 'Show day', venue: { name: 'Exit/In', address: null, phone: null, website: null, city: 'Nashville' } },
};

describe('answers', () => {
  it('reads values as words, never raw JSON', () => {
    expect(displayValue(true)).toBe('Yes');
    expect(displayValue(false)).toBe('No');
    expect(displayValue('  ')).toBeNull();
    expect(displayValue(['a', '', 'b'])).toBe('a, b');
    expect(displayValue({ x: 1 })).toBeNull();
  });

  it('groups questions in order, skips contacts / crew calls / linked groups, keeps TM-only marked', () => {
    const g = answerGroups({ sections: SECTIONS as never, data: DATA, sources: { 's1:doors': { kind: 'pack', file_name: 'Tech pack.pdf', page: 4 } } }, true);
    expect(g.map((x) => [x.label, x.tmOnly, x.answered, x.total])).toEqual([
      ['Schedule', false, 1, 2],
      ['Settlement', true, 1, 1],
      ['Production', false, 2, 2],
    ]);
    expect(g[0].rows[0]).toMatchObject({ value: '19:00', source: 'Tech pack, p.4' });
    expect(g[2].rows.map((r) => r.label)).toEqual(['PA <system>', 'Barricade']);
    expect(g[2].rows[1].value).toBe('No');
  });

  it('sources are only said when asked for, and never for your own typing', () => {
    const g = answerGroups({ sections: SECTIONS as never, data: DATA, sources: { 's1:doors': { kind: 'venue' } } }, false);
    expect(g[0].rows[0].source).toBeNull();
    expect(sourceLabel({ kind: 'you' })).toBeNull();
    expect(sourceLabel({ kind: 'venue' })).toBe('Venue');
  });

  it('contacts are collected once', () => {
    expect(showContacts(DATA)).toEqual([{ name: 'Alyson Estes', role: 'PM', phone: '', email: 'a@x.com' }]);
  });
});

describe('the venue question sheet', () => {
  it('never shows TM-only groups or contacts, and only what the request asked', () => {
    const all = questionGroups({ allSections: SECTIONS as never, data: DATA }, null);
    expect(all.map((g) => g.label)).toEqual(['Schedule', 'Production']);
    const asked = questionGroups({ allSections: SECTIONS as never, data: DATA }, ['s1:curfew', 's3:crew']);
    expect(asked.map((g) => [g.label, g.rows.map((r) => r.label)])).toEqual([
      ['Schedule', ['Curfew']],
      ['Production', ['Local crew']],
    ]);
  });

  it('prints answers already held only when prefill is on', () => {
    const d: AdvanceQuestionsData = { ...head, link: 'https://x/advance-intake/tok', recipientName: null, groups: questionGroups({ allSections: SECTIONS as never, data: DATA }, ['s1:doors']) };
    const off = buildAdvanceQuestionsBodyHtml(d, defaultConfig('advance-questions'));
    const on = buildAdvanceQuestionsBodyHtml(d, normalizeConfig('advance-questions', { advance: { prefill: true } }));
    expect(off).not.toContain('19:00');
    expect(on).toContain('19:00');
    expect(off).toContain('https://x/advance-intake/tok');
  });
});

describe('the filled advance body', () => {
  const data: AdvanceExportData = {
    ...head,
    groups: answerGroups({ sections: SECTIONS as never, data: DATA, sources: {} }, false),
    progress: { answered: 4, total: 5 },
    contacts: showContacts(DATA),
    crewCalls: [],
    linked: { hotels: [], flights: [], deal: null },
    documents: [],
  };

  it('escapes what people typed', () => {
    const html = buildAdvanceBodyHtml(data, defaultConfig('advance'));
    expect(html).toContain('PA &lt;system&gt;');
    expect(html).not.toContain('PA <system>');
  });

  it('follows section order and visibility, and can leave out unanswered questions', () => {
    const cfg = normalizeConfig('advance', { sections: [{ id: 'contacts', show: true }, { id: 'answers', show: true }, { id: 'overview', show: false }], advance: { unanswered: 'hide' } });
    const html = buildAdvanceBodyHtml(data, cfg);
    expect(html.indexOf('Key contacts')).toBeLessThan(html.indexOf('Schedule'));
    expect(html).not.toContain('class="ax-hero"');
    expect(html).not.toContain('Curfew');
    expect(buildAdvanceBodyHtml(data, defaultConfig('advance'))).toContain('Curfew');
  });
});

describe('config', () => {
  it('advance exports are surfaces, PDF only', () => {
    expect(EXPORT_SURFACES).toEqual(expect.arrayContaining(['advance', 'advance-questions']));
    expect(normalizeConfig('advance', { format: 'excel' }).format).toBe('pdf');
    expect(defaultConfig('advance').sections.find((s) => s.id === 'documents')?.show).toBe(false);
  });

  it('a template can no longer carry a logo — exports use the artist\'s own', () => {
    for (const surface of ['routing', 'advance'] as const) {
      expect(normalizeConfig(surface, { header: { logoAssetPath: 'ws/charlotte-logo.png' } }).header.logoAssetPath).toBeNull();
    }
  });
});
