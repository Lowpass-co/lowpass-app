import { describe, expect, it } from 'vitest';
import { splitName } from './RoomingMatrix';

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
