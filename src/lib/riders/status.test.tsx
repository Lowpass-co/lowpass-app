import { describe, expect, it } from 'vitest';
import { repliesToAnswer, showsToSend } from './status';

const TODAY = '2026-12-01';
const shows = [
  { routingId: 'past', date: '2026-11-20' },
  { routingId: 'a', date: '2026-12-03' },
  { routingId: 'b', date: '2026-12-05' },
  { routingId: 'c', date: '2026-12-07' },
];
const links = [
  { id: 'L-a', routingId: 'a' },
  { id: 'L-b', routingId: 'b' },
  { id: 'L-tour', routingId: null },
];

describe('shows to send', () => {
  it('upcoming shows whose link’s NEWEST send isn’t the latest version — no link / never sent counts', () => {
    const sends = [
      { linkId: 'L-a', versionId: 'v2' }, // newest first
      { linkId: 'L-b', versionId: 'v1' },
      { linkId: 'L-a', versionId: 'v1' },
    ];
    expect(showsToSend(shows, links, sends, 'v2', TODAY).map((s) => s.routingId)).toEqual(['b', 'c']);
  });
  it('an older send after a newer one doesn’t matter — the newest decides', () => {
    expect(showsToSend(shows, links, [{ linkId: 'L-b', versionId: 'v1' }, { linkId: 'L-b', versionId: 'v2' }], 'v2', TODAY).map((s) => s.routingId)).toContain('b');
  });
  it('played shows never count; nothing published → nothing to send', () => {
    expect(showsToSend(shows, links, [], 'v1', TODAY).map((s) => s.routingId)).not.toContain('past');
    expect(showsToSend(shows, links, [], null, TODAY)).toEqual([]);
  });
});

describe('replies to answer', () => {
  const r = (linkId: string, blockId: string, author: 'venue' | 'tour', resolvedAt: string | null = null) => ({ linkId, blockId, author, resolvedAt });
  it('one per thread (link × line) where the promoter spoke last and it isn’t resolved', () => {
    expect(
      repliesToAnswer([
        r('L1', 'x', 'venue'),
        r('L1', 'x', 'venue'), // same thread
        r('L1', 'y', 'venue'),
        r('L1', 'y', 'tour'), // answered
        r('L2', 'x', 'venue'), // another show, same line: its own thread
      ]),
    ).toBe(2);
  });
  it('resolved threads don’t count; a new message after resolving reopens it', () => {
    expect(repliesToAnswer([r('L1', 'x', 'venue', '2026-12-01T10:00:00Z')])).toBe(0);
    expect(repliesToAnswer([r('L1', 'x', 'venue', '2026-12-01T10:00:00Z'), r('L1', 'x', 'venue')])).toBe(1);
  });
});
