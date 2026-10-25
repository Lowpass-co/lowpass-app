/* The picker's rules (Oct 2026 redesign): grouping, status lines, search, and
   — the one that went wrong before — where picking a tour takes you. */
import { describe, expect, it } from 'vitest';
import {
  artistStatus,
  filterArtists,
  filterTours,
  formatRange,
  groupTours,
  pickerTourHref,
  tourDetail,
  type PickerArtist,
  type PickerTour,
} from './pickerModel';

const TODAY = '2026-10-25';
const t = (id: string, name: string, start: string | null, end: string | null, artistId = 'cs'): PickerTour => ({
  id, name, artistId, startDate: start, endDate: end,
});
const cs = [
  t('sp', "Simple Plan Support | Fall'26", '2026-10-01', '2026-10-31'),
  t('sat', 'Satellite USA Headline', '2026-09-06', '2026-09-28'),
  t('tw', 'The Warning Support', '2026-06-11', '2026-06-13'),
  t('uk', "UK Headline '27", '2027-02-02', '2027-02-14'),
  t('tbc', 'Michelle Branch Support', null, null),
];

describe('dates', () => {
  it('formats ranges compactly', () => {
    expect(formatRange('2026-10-01', '2026-10-31')).toBe('1 – 31 Oct 2026');
    expect(formatRange('2026-09-28', '2026-10-03')).toBe('28 Sep – 3 Oct 2026');
    expect(formatRange('2026-12-30', '2027-01-04')).toBe('30 Dec 2026 – 4 Jan 2027');
    expect(formatRange(null, null)).toBe('Dates TBC');
  });
  it('says where in the run a live tour is, and how soon a near one starts', () => {
    expect(tourDetail(cs[0], TODAY)).toBe('1 – 31 Oct 2026 · day 25 of 31');
    expect(tourDetail(t('x', 'x', '2026-11-04', '2026-11-20'), TODAY)).toBe('4 – 20 Nov 2026 · starts in 10 days');
    expect(tourDetail(cs[3], TODAY)).toBe('2 – 14 Feb 2027'); // > 60 days: just the dates
  });
});

describe('groupTours', () => {
  it('on the road → upcoming → dates TBC → past (most recent first)', () => {
    const g = groupTours(cs, TODAY);
    expect(g.map((x) => x.key)).toEqual(['road', 'upcoming', 'tbc', 'past']);
    expect(g[3].tours.map((x) => x.id)).toEqual(['sat', 'tw']);
  });
});

describe('artistStatus', () => {
  it('names the live tour day, else the next start, else the last end', () => {
    expect(artistStatus(cs, TODAY)).toEqual({ text: 'On the road · day 25 of 31', live: true });
    expect(artistStatus([cs[3]], TODAY).text).toBe('Next tour starts 2 Feb');
    expect(artistStatus([cs[1], cs[2]], TODAY).text).toBe('Last tour ended 28 Sep 2026');
    expect(artistStatus([], TODAY).text).toBe('No tours yet');
    expect(artistStatus([cs[4]], TODAY).text).toBe('Tour dates TBC');
  });
});

describe('search', () => {
  const artists: PickerArtist[] = [
    { id: 'cs', name: 'Charlotte Sands', imageUrl: null },
    { id: 'cp', name: 'Chance Peña', imageUrl: null },
  ];
  const by = new Map([['cs', cs], ['cp', [] as PickerTour[]]]);
  it('finds an artist by one of its tours, and by name without accents', () => {
    expect(filterArtists(artists, by, 'warning').map((a) => a.id)).toEqual(['cs']);
    expect(filterArtists(artists, by, 'pena').map((a) => a.id)).toEqual(['cp']);
  });
  it('shows only the matching tours unless the artist name matched', () => {
    expect(filterTours(artists[0], cs, 'warning').map((x) => x.id)).toEqual(['tw']);
    expect(filterTours(artists[0], cs, 'charlotte')).toHaveLength(5);
  });
});

describe('pickerTourHref — where a picked tour opens', () => {
  const fb = '/operations/NEW';
  it('keeps you on the same page of the new tour', () => {
    expect(pickerTourHref('/budget/OLD', '?tab=budget', 'NEW', fb)).toBe('/budget/NEW?tab=budget');
    expect(pickerTourHref('/budget/OLD/settlement', '', 'NEW', fb)).toBe('/budget/NEW/settlement');
    expect(pickerTourHref('/operations/OLD/personnel', '', 'NEW', fb)).toBe('/operations/NEW/personnel');
    expect(pickerTourHref('/operations/OLD/routing', '?x=1', 'NEW', fb)).toBe('/operations/NEW/routing');
  });
  it('drops pages that name one record of the old tour', () => {
    expect(pickerTourHref('/advance/OLD/ROUTING123', '', 'NEW', fb)).toBe('/advance/NEW');
    expect(pickerTourHref('/operations/OLD/day/2026-10-25', '', 'NEW', fb)).toBe('/operations/NEW');
    expect(pickerTourHref('/budget/OLD', '?tab=budget&line=abc&version=v2', 'NEW', fb)).toBe('/budget/NEW?tab=budget');
  });
  it('a tourless product landing opens that product', () => {
    expect(pickerTourHref('/budget', '', 'NEW', fb)).toBe('/budget/NEW');
    expect(pickerTourHref('/advance/', '', 'NEW', fb)).toBe('/advance/NEW');
  });
  it('anywhere else uses the tour’s last-used product (the fallback)', () => {
    expect(pickerTourHref('/artists/cs', '', 'NEW', '/budget/NEW')).toBe('/budget/NEW');
    expect(pickerTourHref('/personnel', '', 'NEW', fb)).toBe(fb);
  });
});
