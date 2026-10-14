/* LOWPASS — channel ↔ item linking rules (Oct 2026). */

import { describe, it, expect } from 'vitest';
import { iconForChannel, linkChannel, suggestLinks, tokens } from './channelLinks';
import { getIcon } from './icons';
import type { Channel, EditorItem } from './editor-types';

const ch = (id: string, label: string, o: Partial<Channel> = {}): Channel => ({ id, number: 0, label, color: null, snakeLabel: null, ...o });
const item = (id: string, iconName: string, o: Partial<EditorItem> = {}): EditorItem => ({ id, iconName, xFt: 0, yFt: 0, ...o });
const iconOf = (n: string) => getIcon(n);

describe('tokens', () => {
  it('reads channel-list shorthand', () => {
    expect(tokens('VOX SARA')).toEqual(['vocal', 'sara']);
    expect(tokens('Gtr 1 (L)')).toEqual(['guitar', 'l']);
    expect(tokens('OH L')).toEqual(['overhead', 'l']);
    expect(tokens('LEAD GTR')).toEqual(['lead', 'guitar']);
  });
});

describe('linkChannel — a channel lives in one place', () => {
  const items = [item('a', 'mic-vocal', { channelRowIds: ['c1', 'c2'] }), item('b', 'mic-vocal'), item('c', 'mic-vocal', { channelRowIds: ['c1'] })];

  it('dropping on a new item moves the link there', () => {
    const out = linkChannel(items, 'c1', 'b');
    expect(out.map((i) => i.channelRowIds)).toEqual([['c2'], ['c1'], undefined]);
  });

  it('dropping on the item that already has it changes nothing for it', () => {
    const out = linkChannel(items, 'c2', 'a');
    expect(out[0].channelRowIds).toEqual(['c1', 'c2']);
  });
});

describe('iconForChannel — what a channel dropped on empty stage becomes', () => {
  it.each([
    [{ label: 'KICK IN', mic: 'Beta 91' }, 'mic-kick'],
    [{ label: 'OH L', mic: 'KM184' }, 'mic-overhead'],
    [{ label: 'RACK TOM', mic: 'e604' }, 'mic-tom-clip'],
    [{ label: 'BASS', mic: null, di: 'Radial J48' }, 'di-mono'],
    [{ label: 'KEYS L', mic: 'DI' }, 'di-mono'],
    [{ label: 'TALKBACK', mic: 'SM58' }, 'mic-talkback'],
    [{ label: 'VOX SARA', mic: 'SM58' }, 'mic-vocal'],
  ])('%o → %s', (c, icon) => {
    expect(iconForChannel(c as never)).toBe(icon);
    expect(getIcon(icon)).toBeDefined();
  });
});

describe('suggestLinks — only a clear best match', () => {
  const items = [
    item('kit', 'drum-kit-rh', { label: 'Drums' }),
    item('kickmic', 'mic-kick'),
    item('sara', 'person-female', { label: 'Sara' }),
    item('tom', 'person-male', { label: 'Tom' }),
    item('amp1', 'amp-combo-1x12', { label: 'Gtr amp' }),
    item('amp2', 'amp-combo-1x12', { label: 'Gtr amp 2' }),
    item('keys', 'keys-stage-88', { label: 'Keys' }),
    item('note', '', { kind: 'text', text: 'KICK' }),
    item('power', 'infra-power-4', { label: 'Power' }),
  ];
  const channels = [ch('k', 'KICK'), ch('s', 'SNARE'), ch('v', 'VOX SARA'), ch('vt', 'VOX TOM'), ch('g', 'GTR'), ch('kl', 'KEYS L'), ch('pw', 'POWER'), ch('done', 'OH', {})];
  const linked = items.map((i) => (i.id === 'kit' ? { ...i, channelRowIds: ['done'] } : i));
  const s = Object.fromEntries(suggestLinks(channels, linked, iconOf).map((x) => [x.channelId, x.itemId]));

  it('kick goes to the kick mic, snare to the kit', () => {
    expect(s.k).toBe('kickmic');
    expect(s.s).toBe('kit');
  });

  it('a vocal channel goes to the singer named in it — even one called Tom', () => {
    expect(s.v).toBe('sara');
    expect(s.vt).toBe('tom');
  });

  it('keys goes to the keys', () => {
    expect(s.kl).toBe('keys');
  });

  it('no coin tosses (two guitar amps), no text notes, no infrastructure, nothing already placed', () => {
    expect(s.g).toBeUndefined();
    expect(s.pw).toBeUndefined();
    expect(s.done).toBeUndefined();
    expect(Object.values(s)).not.toContain('note');
  });
});
