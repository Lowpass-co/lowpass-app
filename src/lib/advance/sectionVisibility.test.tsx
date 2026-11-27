import { describe, expect, it } from 'vitest';
import { parseShowWhen, sectionShown, shownSections } from './sectionVisibility';
import { cleanFileChanges, fileBelongs, parseFileAnswer } from './fileAnswers';

const show = { template_id: 'show', fields: [{ id: 'indoor_outdoor' }] };
const weather = { template_id: 'wx', fields: [{ id: 'rain_plan' }], show_when: { field: 'indoor_outdoor', in: ['Outdoor', 'Covered'] } };

describe('sections shown only when (Weather & Outdoor)', () => {
  it('hidden until the question is answered that way', () => {
    expect(sectionShown(weather, [show, weather], {})).toBe(false);
    expect(sectionShown(weather, [show, weather], { show: { indoor_outdoor: 'Indoor' } })).toBe(false);
    expect(sectionShown(weather, [show, weather], { show: { indoor_outdoor: 'outdoor ' } })).toBe(true);
    expect(shownSections([show, weather], { show: { indoor_outdoor: 'Covered' } }).map((s) => s.template_id)).toEqual(['show', 'wx']);
  });
  it('a section with no condition always shows', () => {
    expect(sectionShown(show, [show], null)).toBe(true);
  });
  it('the gate keeps only a well-formed condition', () => {
    expect(parseShowWhen({ field: 'x', in: ['A', 3] })).toEqual({ field: 'x', in: ['A'] });
    expect(parseShowWhen({ field: '', in: ['A'] })).toBeNull();
    expect(parseShowWhen({ field: 'x', in: [] })).toBeNull();
    expect(parseShowWhen('x')).toBeNull();
  });
});

describe('upload answers stay inside their show', () => {
  const WS = 'w1', T = 't1', R = 'r1';
  const ok = 'advance-files/w1/t1/r1/123e4567-e89b-42d3-a456-426614174000.pdf';
  it('only this show’s folder, only ids we mint', () => {
    expect(fileBelongs(ok, WS, T, R)).toBe(true);
    expect(fileBelongs(ok.replace('/r1/', '/r2/'), WS, T, R)).toBe(false);
    expect(fileBelongs('advance-files/w1/t1/r1/../../x/123e4567-e89b-42d3-a456-426614174000.pdf', WS, T, R)).toBe(false);
    expect(fileBelongs('advance-files/w1/t1/r1/sub/123e4567-e89b-42d3-a456-426614174000.pdf', WS, T, R)).toBe(false);
    expect(fileBelongs('advance-files/w1/t1/r1/123e4567-e89b-42d3-a456-426614174000.html', WS, T, R)).toBe(false);
  });
  it('a stored answer keeps the good files and drops the rest', () => {
    const v = [{ path: ok, name: 'Patch.pdf', size: 10, type: 'application/pdf' }, { path: 'rider-photos/w1/x.png', name: 'x' }];
    expect(parseFileAnswer(v, WS, T, R)).toEqual([{ path: ok, name: 'Patch.pdf', size: 10, type: 'application/pdf' }]);
  });
  it('a save cleans upload questions only', () => {
    const sections = [{ template_id: 's', fields: [{ id: 'patch', type: 'file' }, { id: 'pa', type: 'text' }] }];
    const out = cleanFileChanges(sections, { s: { patch: [{ path: 'elsewhere/x.pdf', name: 'x' }], pa: 'L-Acoustics' } }, { ws: WS, tourId: T, routingId: R });
    expect(out).toEqual({ s: { patch: [], pa: 'L-Acoustics' } });
  });
});
