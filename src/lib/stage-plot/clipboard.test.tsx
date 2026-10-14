/* LOWPASS — stage plot copy / paste rules (Oct 2026). */

import { describe, it, expect } from 'vitest';
import { cloneForPaste, parseClip, serializeClip, MAX_PASTE } from './clipboard';
import type { EditorItem } from './editor-types';

let n = 0;
const newId = () => `new${++n}`;
const items: EditorItem[] = [
  { id: 'a', iconName: 'mic-vocal', xFt: 4, yFt: 5, label: 'Vox', colorTint: '#ff0000', rotationDeg: 30, channelRowIds: ['ch1'] },
  { id: 'b', iconName: 'drum-snare', xFt: 10, yFt: 3, groupId: 'kit1', kitName: 'drum-kit-rh' },
  { id: 'c', iconName: 'drum-kick', xFt: 11, yFt: 3, groupId: 'kit1', kitName: 'drum-kit-rh' },
  { id: 'd', iconName: '', kind: 'arrow', xFt: 1, yFt: 1, x2Ft: 3, y2Ft: 2 },
];

describe('copy → paste', () => {
  it('round-trips through the clipboard text', () => {
    expect(parseClip(serializeClip(items))).toEqual(items);
  });

  it('ignores anything that is not ours, or is malformed', () => {
    expect(parseClip('hello')).toBeNull();
    expect(parseClip('')).toBeNull();
    expect(parseClip('{"kind":"lowpass/stage-plot-items@1","items":"x"}')).toBeNull();
    expect(parseClip('{"kind":"lowpass/stage-plot-items@1"')).toBeNull();
    expect(parseClip('{"kind":"lowpass/stage-plot-items@1","items":[{"iconName":"x","xFt":"1","yFt":2},null]}')).toBeNull();
  });

  it('caps a huge paste', () => {
    const many = Array.from({ length: MAX_PASTE + 50 }, (_, i) => ({ id: `${i}`, iconName: 'mic-vocal', xFt: 1, yFt: 1 }));
    expect(parseClip(serializeClip(many))?.length).toBe(MAX_PASTE);
  });

  it('a pasted copy is new: fresh ids, offset, look kept, channel links dropped', () => {
    const [a] = cloneForPaste([items[0]], 1, newId);
    expect(a.id).not.toBe('a');
    expect([a.xFt, a.yFt]).toEqual([5, 6]);
    expect(a).toMatchObject({ label: 'Vox', colorTint: '#ff0000', rotationDeg: 30, iconName: 'mic-vocal' });
    expect(a.channelRowIds).toBeUndefined();
  });

  it('copied kit pieces get ONE new group, never the original', () => {
    const [b, c] = cloneForPaste([items[1], items[2]], 1, newId);
    expect(b.groupId).toBe(c.groupId);
    expect(b.groupId).not.toBe('kit1');
    expect(b.kitName).toBe('drum-kit-rh');
  });

  it('an arrow moves both ends', () => {
    const [d] = cloneForPaste([items[3]], 2, newId);
    expect([d.xFt, d.yFt, d.x2Ft, d.y2Ft]).toEqual([3, 3, 5, 4]);
  });

  it('a cut pastes back in place (offset 0)', () => {
    const [a] = cloneForPaste([items[0]], 0, newId);
    expect([a.xFt, a.yFt]).toEqual([4, 5]);
  });
});
