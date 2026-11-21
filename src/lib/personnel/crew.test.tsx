import { describe, expect, it } from 'vitest';
import { accessWrites, departmentOf, groupByDepartment, inferRoleTag, isWholeTour, presetRows } from './crew';
import { PRESET_ACCESS } from '@/lib/permissions/areas';

describe('inferRoleTag', () => {
  it.each([
    ['Tour Manager', 'tm'],
    ['TM', 'tm'],
    ['TM / FOH', 'tm'],
    ['TM Assistant', 'tm2'],
    ['Assistant Tour Manager', 'tm2'],
    ['ATM', 'tm2'],
    ['Production Manager', 'pm'],
    ['FOH Engineer', 'foh'],
    ['Front of House', 'foh'],
    ['Sound Engineer', 'foh'],
    ['Monitor Engineer', 'mons'],
    ['Mons', 'mons'],
    ['Lighting Designer', 'ld'],
    ['LD', 'ld'],
    ['Backline Tech', 'backline'],
    ['Guitar Tech', 'backline'],
    ['Keys Tech', 'backline'],
    ['Drummer', 'band'],
    ['Keys', 'band'],
    ['Musical Director', 'band'],
    ['Artist Manager', 'management'],
    ['Management', 'management'],
    ['Merch', 'other'],
    ['Stage Manager', 'other'],
    ['Merch Manager', 'other'],
    ['', 'other'],
    [null, 'other'],
  ])('%s → %s', (role, tag) => {
    expect(inferRoleTag(role)).toBe(tag);
  });
});

describe('departments', () => {
  it('groups in a fixed order and drops empty groups', () => {
    const rows = [{ t: 'ld' }, { t: 'tm' }, { t: 'foh' }, { t: 'zzz' }, { t: 'mons' }];
    expect(groupByDepartment(rows, (r) => r.t).map((g) => [g.dept, g.rows.length])).toEqual([
      ['tour', 1],
      ['audio', 2],
      ['lighting', 1],
      ['other', 1],
    ]);
    expect(departmentOf(null)).toBe('other');
  });
});

describe('isWholeTour', () => {
  it('no dates, or the tour window, is the whole tour', () => {
    expect(isWholeTour(null, null, '2026-11-26', '2026-12-05')).toBe(true);
    expect(isWholeTour('2026-11-26', '2026-12-05', '2026-11-26', '2026-12-05')).toBe(true);
    expect(isWholeTour('2026-11-26', null, '2026-11-26', '2026-12-05')).toBe(true);
    expect(isWholeTour('2026-11-28', '2026-12-05', '2026-11-26', '2026-12-05')).toBe(false);
  });
});

describe('accessWrites — giving a login preset on one tour', () => {
  const T = 'tour-1';
  it('inserts every area of the preset for a member with nothing', () => {
    const w = accessWrites([], T, 'crew');
    expect(w.raise).toEqual([]);
    expect(Object.fromEntries(w.insert.map((r) => [r.area, r.level]))).toEqual(PRESET_ACCESS.crew);
  });
  it('never lowers: an edit row stays, a view row is raised, an all-tours row covers', () => {
    const existing = [
      { id: 'a', tour_id: T, area: 'files', level: 'edit' },
      { id: 'b', tour_id: T, area: 'advance', level: 'view' },
      { id: 'c', tour_id: null, area: 'production', level: 'edit' },
      { id: 'd', tour_id: 'other-tour', area: 'parking', level: 'edit' },
    ];
    const w = accessWrites(existing, T, 'production');
    expect(w.raise).toEqual(['b']);
    const ins = Object.fromEntries(w.insert.map((r) => [r.area, r.level]));
    expect(ins).toEqual({ schedule: 'edit', parking: 'edit', logistics: 'view' });
    expect(ins.files).toBeUndefined();
    expect(ins.production).toBeUndefined();
  });
  it('is a no-op the second time', () => {
    const first = accessWrites([], T, 'accounts');
    const rows = first.insert.map((r, i) => ({ id: String(i), ...r, tour_id: T }));
    expect(accessWrites(rows, T, 'accounts')).toEqual({ insert: [], raise: [] });
  });
  it('presetRows is the preset on this tour only', () => {
    expect(presetRows(T, 'crew').every((r) => r.tour_id === T)).toBe(true);
    expect(presetRows(T, 'tour_manager')).toHaveLength(10);
  });
});

import { matchesCandidate, rankCandidates } from './crew';

describe('rankCandidates', () => {
  const tours = [
    { id: 'T', name: 'This tour', artist_id: 'A', start_date: '2026-11-26' },
    { id: 'old', name: 'Satellite 26', artist_id: 'A', start_date: '2026-03-01' },
    { id: 'older', name: 'Spring 25', artist_id: 'A', start_date: '2025-04-01' },
    { id: 'else', name: 'Other act', artist_id: 'B', start_date: '2026-09-01' },
  ];
  const person = (id: string, name: string) => ({ id, name, email: null, phone: null, role: null, user_id: null });
  const r = rankCandidates({
    people: [person('zed', 'Zed'), person('amy', 'Amy'), person('on', 'Already On'), person('bo', 'Bo'), person('cy', 'Cy')],
    assignments: [
      { person_id: 'on', tour_id: 'T' },
      { person_id: 'cy', tour_id: 'older' },
      { person_id: 'bo', tour_id: 'old' },
      { person_id: 'bo', tour_id: 'else' },
      { person_id: 'amy', tour_id: 'else' },
    ],
    tours,
    tourId: 'T',
    artistId: 'A',
  });
  it("this artist's people first, most recent first; then A–Z; people already on the tour flagged, not hidden", () => {
    expect(r.map((c) => c.id)).toEqual(['bo', 'cy', 'on', 'amy', 'zed']);
    expect(r.filter((c) => c.onTour).map((c) => c.id)).toEqual(['on']);
  });
  it('last tour is the latest by start date, whatever the artist', () => {
    expect(r.find((c) => c.id === 'bo')!.lastTour).toEqual({ name: 'Other act', start: '2026-09-01' });
    expect(r.find((c) => c.id === 'zed')!.lastTour).toBeNull();
  });
  it('matches every word against name, email and role', () => {
    const c = { ...r[0], name: 'Ben Quinton', email: 'ben@x.co', usualRole: 'TM Assistant' };
    expect(matchesCandidate(c, 'ben tm')).toBe(true);
    expect(matchesCandidate(c, 'quin ass')).toBe(true);
    expect(matchesCandidate(c, 'ben foh')).toBe(false);
    expect(matchesCandidate(c, '  ')).toBe(true);
  });
});
