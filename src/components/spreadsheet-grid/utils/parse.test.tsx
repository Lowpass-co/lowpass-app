/* Grid number cells can be cleared (Oct 2026: "can't default to 0"). */

import { describe, it, expect } from 'vitest';
import { parseInput } from './parse';

describe('parseInput', () => {
  it('an emptied number, money or percent cell is 0', () => {
    expect(parseInput('', { kind: 'currency', currency: 'GBP' })).toEqual({ ok: true, value: 0 });
    expect(parseInput('  ', { kind: 'number' })).toEqual({ ok: true, value: 0 });
    expect(parseInput('', { kind: 'percent' })).toEqual({ ok: true, value: 0 });
  });
  it('typing 0 is 0', () => {
    expect(parseInput('0', { kind: 'currency', currency: 'GBP' })).toEqual({ ok: true, value: 0 });
  });
  it('a column with a minimum still refuses an empty cell below it', () => {
    expect(parseInput('', { kind: 'number', min: 1 })).toEqual({ ok: false, error: 'Min 1' });
  });
  it('rubbish is still refused', () => {
    expect(parseInput('abc', { kind: 'number' })).toEqual({ ok: false, error: 'Enter a number' });
  });
});
