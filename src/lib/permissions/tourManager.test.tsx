/* The Tour manager tier on screen (Nov 2026, migration 298). */
import { describe, expect, it } from 'vitest';
import { railAllows } from '@/lib/nav/ia';
import { summariseTours } from './areas';
import { ROLES, ROLE_LABEL, isTourScoped } from './roles';
import { runsTour } from './tourAccess';

const TM = { manager: false, tour: {}, runsTour: true, library: true };
const MEMBER = { manager: false, tour: { schedule: 'edit' as const }, runsTour: false, library: false };

describe('rail', () => {
  it('Tour settings: whoever runs the tour', () => {
    expect(railAllows(TM, 'runsTour')).toBe(true);
    expect(railAllows(MEMBER, 'runsTour')).toBe(false);
    expect(railAllows({ manager: true, tour: {} }, 'runsTour')).toBe(true);
  });
  it('Templates / People / Gear: Tour manager yes, Member no', () => {
    expect(railAllows(TM, 'library')).toBe(true);
    expect(railAllows(MEMBER, 'library')).toBe(false);
  });
  it('a Tour manager still never opens manager-only items', () => {
    expect(railAllows(TM, 'manager')).toBe(false);
  });
});

describe('roles', () => {
  it('four, most to least, one label each', () => {
    expect(ROLES).toEqual(['admin', 'manager', 'tour_manager', 'readonly']);
    expect(ROLE_LABEL.tour_manager).toBe('Tour manager');
  });
  it('Members and Tour managers are scoped by tour access', () => {
    expect(ROLES.filter(isTourScoped)).toEqual(['tour_manager', 'readonly']);
  });
  it('runsTour: managers always; a Tour manager only where the database said so', () => {
    expect(runsTour({ manager: true, role: 'manager', tour: {} })).toBe(true);
    expect(runsTour({ manager: false, role: 'tour_manager', tour: {}, runsTour: false })).toBe(false);
    expect(runsTour({ manager: false, role: 'tour_manager', tour: {}, runsTour: true })).toBe(true);
    expect(runsTour(null)).toBe(false);
  });
});

describe('summariseTours', () => {
  it('counts tours, says everything', () => {
    expect(summariseTours([])).toBe('No tours yet');
    expect(summariseTours([{ tour_id: 't1', area: 'schedule', level: 'edit' }, { tour_id: 't1', area: 'budget', level: 'view' }])).toBe('1 tour · everything');
    expect(summariseTours([{ tour_id: null, area: 'schedule', level: 'view' }])).toBe('All tours · everything');
  });
});
