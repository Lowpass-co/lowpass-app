/* LOWPASS — sheet palette lookups (Oct 2026). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayTypeSwatch, roomSwatch, statusSwatch, ROOM_SWATCH_CODES } from './sheetPalette';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('sheet palette', () => {
  it('pay statuses read as full words with their sheet colours', () => {
    expect(statusSwatch('show')).toEqual({ bg: 'var(--lp-sheet-show-bg)', fg: 'var(--lp-sheet-show-fg)', label: 'SHOW' });
    expect(statusSwatch('off_travel')?.label).toBe('TRAVEL');
    expect(statusSwatch('rehearsal')?.label).toBe('REHEARSAL');
    expect(statusSwatch('no_tour')).toBeNull();
    expect(statusSwatch('')).toBeNull();
  });

  it('day types use the first of a CSV; custom types still get a swatch', () => {
    expect(dayTypeSwatch('show,festival')?.label).toBe('SHOW');
    expect(dayTypeSwatch('Load in')?.label).toBe('LOAD IN');
    expect(dayTypeSwatch(null)).toBeNull();
  });

  it('every room code has its own colour; "-" has none', () => {
    const bgs = ROOM_SWATCH_CODES.map((c) => roomSwatch(c)!.bg);
    expect(new Set(bgs).size).toBe(ROOM_SWATCH_CODES.length);
    expect(roomSwatch('-')).toBeNull();
  });

  it('every token the palette uses is defined for light AND dark', () => {
    const used = new Set<string>();
    for (const s of [...['show', 'travel', 'off', 'rehearsal', 'promo_radio', 'pd_only'].map(statusSwatch), dayTypeSwatch('prep'), ...ROOM_SWATCH_CODES.map(roomSwatch)]) {
      for (const v of [s!.bg, s!.fg]) used.add(v.slice(4, -1));
    }
    const light = css.slice(css.indexOf('Sheet palette'));
    const darkBlock = light.slice(light.indexOf('.dark {'));
    for (const t of used) {
      expect(light.split('.dark {')[0]).toContain(`${t}:`);
      expect(darkBlock).toContain(`${t}:`);
    }
  });
});
