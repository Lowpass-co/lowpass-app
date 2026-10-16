import { describe, expect, it } from 'vitest';
import { lastUpdatedLabel, splitName } from './RoomingMatrix';

// Rooming shows Forename / Surname columns from the one stored full name.
describe('splitName', () => {
  it('first word is the forename, the rest the surname', () => {
    expect(splitName('Sam Whitfield-Jones')).toEqual(['Sam', 'Whitfield-Jones']);
    expect(splitName('Mary Ann de la Cruz')).toEqual(['Mary', 'Ann de la Cruz']);
  });
  it('one word → forename only; extra spaces ignored', () => {
    expect(splitName('Cher')).toEqual(['Cher', '']);
    expect(splitName('  Tom   O’Neill ')).toEqual(['Tom', 'O’Neill']);
  });
});

// Rooming header "Last updated" (migration 273 stamp).
describe('lastUpdatedLabel', () => {
  const now = new Date(2026, 9, 16, 15, 0);
  it('this year → date and time', () => {
    expect(lastUpdatedLabel(new Date(2026, 9, 16, 13, 5).toISOString(), now)).toBe('16 Oct, 13:05');
  });
  it('an older year → date with year, no time', () => {
    expect(lastUpdatedLabel(new Date(2025, 2, 3, 9, 0).toISOString(), now)).toBe('3 Mar 2025');
  });
  it('nothing recorded (or before migration 273) → —', () => {
    expect(lastUpdatedLabel(null, now)).toBe('—');
    expect(lastUpdatedLabel('not a date', now)).toBe('—');
  });
});
