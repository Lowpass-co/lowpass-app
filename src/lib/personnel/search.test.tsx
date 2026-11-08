import { describe, expect, it } from 'vitest';
import { searchPeople, type SearchablePerson } from './search';

const p = (fullName: string, extra: Partial<SearchablePerson> = {}): SearchablePerson => ({
  fullName,
  preferredName: null,
  jobTitle: null,
  email: null,
  phone: null,
  groups: [],
  ...extra,
});

const people = [
  p('Samuel Okafor', { preferredName: 'Sam', jobTitle: 'FOH Engineer', groups: ['crew'], phone: '+44 (0)7700 900123' }),
  p('Zoë Hart', { jobTitle: 'Tour Manager', groups: ['tour_manager'], email: 'zoe@hartmgmt.co' }),
  p('Ben Price', { jobTitle: 'Monitor Engineer', groups: ['crew'], phone: '07911 123456' }),
  p('Charlotte Sands', { groups: ['artist'] }),
];
const names = (q: string) => searchPeople(people, q).map((x) => x.fullName);

describe('searchPeople', () => {
  it('an empty box shows everyone, in order', () => {
    expect(names('')).toEqual(people.map((x) => x.fullName));
    expect(names('   ')).toHaveLength(4);
  });
  it('name, preferred name, job title and email', () => {
    expect(names('sam')).toEqual(['Samuel Okafor']);
    expect(names('ENGINEER')).toEqual(['Samuel Okafor', 'Ben Price']);
    expect(names('hartmgmt')).toEqual(['Zoë Hart']);
  });
  it('accents are ignored', () => expect(names('zoe')).toEqual(['Zoë Hart']));
  it('every word must match, in any field', () => {
    expect(names('engineer crew monitor')).toEqual(['Ben Price']);
    expect(names('sam artist')).toEqual([]);
  });
  it('groups answer to the badge and the full name', () => {
    expect(names('tm')).toEqual(['Zoë Hart']);
    expect(names('tour manager')).toEqual(['Zoë Hart']);
    expect(names('artist')).toEqual(['Charlotte Sands']);
  });
  it('phone fragments match whatever the spacing', () => {
    expect(names('07700 900')).toEqual(['Samuel Okafor']);
    expect(names('7700900')).toEqual(['Samuel Okafor']);
    expect(names('+44 7700')).toEqual(['Samuel Okafor']); // the stored "(0)" is skipped
    expect(names('(07911) 123-456')).toEqual(['Ben Price']);
    expect(names('0791199')).toEqual([]); // digits not in that order
  });
  it('a short number is just text', () => expect(names('07')).toEqual(['Ben Price']));
});
