/* Rooming assignments → stays: the grid writes one row per person per night
   into one room row per hotel + room code; a rooming list needs stays. */

import { describe, it, expect } from 'vitest';
import { buildStays, nightsOf, roomLabel, summariseStays, type NightInput } from './stays';

const night = (person: string, roomType: string, date: string, hotelKey = 'h1'): NightInput => ({
  hotelKey, person, roomId: `room-${hotelKey}-${roomType}`, roomType, roomNumber: null, startsOn: date, endsOn: date,
});

describe('stays', () => {
  it('nights: a range is [in, out); a same-day row is that one night', () => {
    expect(nightsOf('2026-09-09', '2026-09-12')).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
    expect(nightsOf('2026-09-09', '2026-09-09')).toEqual(['2026-09-09']);
  });

  it('three single nights become one stay per person, not one shared room', () => {
    const rows = ['Ann', 'Ben', 'Cat'].flatMap((p) => ['2026-09-09', '2026-09-10', '2026-09-11'].map((d) => night(p, 'SGL', d)));
    const stays = buildStays(rows);
    expect(stays.map((s) => [s.guests.join('+'), s.checkIn, s.checkOut, s.nights])).toEqual([
      ['Ann', '2026-09-09', '2026-09-12', 3],
      ['Ben', '2026-09-09', '2026-09-12', 3],
      ['Cat', '2026-09-09', '2026-09-12', 3],
    ]);
    expect(summariseStays(stays)).toMatchObject({ people: 3, roomNights: 9, peakRooms: 3 });
  });

  it('a shared code is one room for everyone on it that night', () => {
    const rows = ['Dan', 'Eve'].flatMap((p) => ['2026-09-09', '2026-09-10'].map((d) => night(p, 'DBL (A)', d)));
    const stays = buildStays(rows);
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ guests: ['Dan', 'Eve'], nights: 2, checkOut: '2026-09-11' });
  });

  it('a change of room-mate or a gap starts a new stay', () => {
    const rows = [
      night('Dan', 'DBL (A)', '2026-09-09'), night('Eve', 'DBL (A)', '2026-09-09'),
      night('Dan', 'DBL (A)', '2026-09-10'),
      night('Dan', 'DBL (A)', '2026-09-12'),
    ];
    expect(buildStays(rows).map((s) => [s.guests.join('+'), s.checkIn, s.nights])).toEqual([
      ['Dan+Eve', '2026-09-09', 1],
      ['Dan', '2026-09-10', 1],
      ['Dan', '2026-09-12', 1],
    ]);
  });

  it('"-" (no room) and nights outside the range are left out', () => {
    const rows = [night('Ann', '-', '2026-09-09'), night('Ann', 'SGL', '2026-09-10'), night('Ann', 'SGL', '2026-09-11')];
    const stays = buildStays(rows, { from: '2026-09-11', to: null });
    expect(stays.map((s) => [s.checkIn, s.nights])).toEqual([['2026-09-11', 1]]);
  });

  it('rooms needed per night follow the people in them', () => {
    const rows = [night('Ann', 'SGL', '2026-09-09'), night('Ben', 'SGL', '2026-09-09'), night('Ann', 'SGL', '2026-09-10')];
    expect(summariseStays(buildStays(rows)).perNight).toEqual([{ night: '2026-09-09', rooms: 2 }, { night: '2026-09-10', rooms: 1 }]);
  });

  it('labels read as a hotel would write them', () => {
    expect(roomLabel('SGL', null)).toBe('Single');
    expect(roomLabel('DBL (A)', null)).toBe('Double (A)');
    expect(roomLabel('King', '412')).toBe('King · #412');
  });
});
