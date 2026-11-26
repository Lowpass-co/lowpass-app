/* ============================================
   LOWPASS — Riders: what's left to do — pure (Nov 2026)

   The two "to do" facts, as ONE rule each, read by the Riders page (Shows /
   Replies tabs) and the tour Overview's "Needs you" — so they can't disagree:
     · a show is waiting for the latest version when its link's newest send
       isn't that version (no link / never sent counts too);
     · a reply needs answering when the promoter spoke last on that line and
       the thread isn't resolved.
   ============================================ */

/** Upcoming shows (date ≥ today) not yet sent the latest version.
 *  `sends` newest first (the loaders order them so). */
export function showsToSend<S extends { routingId: string; date: string }>(
  shows: readonly S[],
  links: readonly { id: string; routingId: string | null }[],
  sends: readonly { linkId: string; versionId: string }[],
  latestId: string | null,
  today: string,
): S[] {
  if (!latestId) return [];
  const linkOf = new Map<string, string>();
  for (const l of links) if (l.routingId && !linkOf.has(l.routingId)) linkOf.set(l.routingId, l.id);
  const newest = new Map<string, string>();
  for (const s of sends) if (!newest.has(s.linkId)) newest.set(s.linkId, s.versionId);
  return shows.filter((s) => {
    if (s.date < today) return false;
    const link = linkOf.get(s.routingId);
    return !link || newest.get(link) !== latestId;
  });
}

export interface ReplyFact {
  linkId: string;
  blockId: string;
  author: 'venue' | 'tour';
  resolvedAt: string | null;
}

/** Threads (one per link × line) where the promoter spoke last and it isn't
 *  resolved. `replies` oldest first. */
export function repliesToAnswer(replies: readonly ReplyFact[]): number {
  const threads = new Map<string, { last: ReplyFact; resolved: boolean }>();
  for (const r of replies) {
    const key = `${r.linkId}:${r.blockId}`;
    const t = threads.get(key);
    threads.set(key, { last: r, resolved: (t ? t.resolved : true) && !!r.resolvedAt });
  }
  let n = 0;
  for (const t of threads.values()) if (t.last.author === 'venue' && !t.resolved) n += 1;
  return n;
}
