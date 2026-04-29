/**
 * UX08b — Tiny fuzzy matcher (no library dep).
 *
 * Scoring scheme (per UX08b §3):
 *   - exact substring match: +1000
 *   - consecutive char match: +50 each
 *   - starts-with-word match: +30 each
 *   - sequential char match:  +10 each
 *   - case-match bonus:       +5
 *   - position penalty:       -position
 *
 * Order matters: `fuzzyMatch("Britannia Row Audio", "brit row")` outscores
 * `fuzzyMatch("Audio Britannia Row", "brit row")` because the second
 * candidate has the matched chars further in.
 *
 * Returns `null` if any query character can't be matched in order.
 */

export type FuzzyMatch = {
  /** Higher = better. */
  score: number;
  /** Inclusive-start, exclusive-end ranges into `haystack` for highlighting. */
  ranges: Array<[number, number]>;
};

const MAX_MATCH_RANGES = 32;

/** Word-boundary check: char is at start of string OR preceded by a non-word char. */
function isWordStart(haystack: string, i: number): boolean {
  if (i === 0) return true;
  const prev = haystack.charCodeAt(i - 1);
  // ASCII fast path: a-z, A-Z, 0-9 are word chars; everything else is a boundary.
  const isPrevWord =
    (prev >= 0x30 && prev <= 0x39) ||
    (prev >= 0x41 && prev <= 0x5a) ||
    (prev >= 0x61 && prev <= 0x7a);
  return !isPrevWord;
}

function pushRange(ranges: Array<[number, number]>, idx: number): void {
  if (ranges.length === 0) {
    ranges.push([idx, idx + 1]);
    return;
  }
  const last = ranges[ranges.length - 1];
  if (last[1] === idx) {
    last[1] = idx + 1;
  } else if (ranges.length < MAX_MATCH_RANGES) {
    ranges.push([idx, idx + 1]);
  }
}

/**
 * Greedy left-to-right matcher. For each query char, find the next
 * occurrence in the haystack (case-insensitive) starting at the current
 * cursor; bail out with null if any char fails to match.
 */
export function fuzzyMatch(haystack: string, query: string): FuzzyMatch | null {
  const q = query.trim();
  if (q.length === 0) return { score: 0, ranges: [] };
  if (haystack.length === 0) return null;

  const hLower = haystack.toLowerCase();
  const qLower = q.toLowerCase();

  // Exact substring fast path — scoring lands a big bonus and we keep the
  // first match's range. Position penalty still applies (early > late).
  const exactIdx = hLower.indexOf(qLower);
  if (exactIdx >= 0) {
    return {
      score: 1000 - exactIdx,
      ranges: [[exactIdx, exactIdx + q.length]],
    };
  }

  let cursor = 0;
  let score = 0;
  let prevMatchedAt = -2; // -2 so the first match isn't counted as consecutive
  const ranges: Array<[number, number]> = [];

  for (let i = 0; i < qLower.length; i++) {
    const found = hLower.indexOf(qLower[i], cursor);
    if (found < 0) return null;

    score -= found - cursor; // position penalty (further from cursor → worse)
    score += 10; // sequential match base

    if (found === prevMatchedAt + 1) score += 50; // consecutive
    if (isWordStart(haystack, found)) score += 30; // starts-with-word
    // Case-match bonus: compares user-typed query char against the haystack
    // char as-typed (not lowercased), so "Brit" matching "Brit" wins over
    // "brit" matching "Brit".
    if (haystack.charCodeAt(found) === q.charCodeAt(i)) score += 5;

    pushRange(ranges, found);
    prevMatchedAt = found;
    cursor = found + 1;
  }

  return { score, ranges };
}
